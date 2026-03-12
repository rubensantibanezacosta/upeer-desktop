/**
 * Identity-based Rate Limiter with reputation integration
 * Extends the base RateLimiter to add identity-based limiting and reputation-aware limits
 */

import { RateLimiter, RateLimitRule, RateLimitConfig } from './rate-limiter.js';
import { computeScore } from './reputation/vouches.js';
import { warn } from './secure-logger.js';

interface IdentityTokenBucket {
    tokens: number;
    lastRefill: number;
}

/** Caché de directContactIds para no consultar la DB en cada paquete */
let _cachedDirectIds: Set<string> = new Set();
let _cacheTs: number = 0;
const _CACHE_TTL = 60_000; // refrescar cada 60 s

async function _getDirectContactIds(): Promise<Set<string>> {
    const now = Date.now();
    if (now - _cacheTs < _CACHE_TTL) return _cachedDirectIds;
    try {
        const { getContacts } = await import('../storage/db.js');
        const contacts = (getContacts() as any[]);
        _cachedDirectIds = new Set<string>(
            contacts
                .filter((c: any) => c.status === 'connected' && c.upeerId)
                .map((c: any) => c.upeerId as string)
        );
        _cacheTs = now;
    } catch { /* mantener caché anterior si falla */ }
    return _cachedDirectIds;
}

export class IdentityRateLimiter extends RateLimiter {
    private identityBuckets: Map<string, Map<string, IdentityTokenBucket>> = new Map(); // upeerId -> messageType -> bucket

    constructor(rules?: RateLimitRule) {
        super(rules);
    }

    /**
     * Check if a message from given IP is allowed (IP-based rate limiting only)
     * Alias for super.check() for clarity
     */
    checkIp(ip: string, messageType: string): boolean {
        return super.check(ip, messageType);
    }

    /**
     * Check if a message from given identity is allowed (identity-based rate limiting only)
     * Uses reputation-adjusted limits
     */
    checkIdentityOnly(upeerId: string, messageType: string): boolean {
        if (!upeerId) {
            // No identity, cannot apply identity-based limiting
            return true;
        }

        // Refrescar caché de contactos en background si ha expirado (no bloquea)
        if (Date.now() - _cacheTs >= _CACHE_TTL) {
            _getDirectContactIds().catch((err) => warn('Failed to get direct contact IDs', err, 'rate-limiter'));
        }

        const rule = (this as any).rules[messageType];
        if (!rule) {
            // No rule for this message type = unlimited
            return true;
        }

        // Calculate reputation-adjusted limit
        const adjustedRule = this.getAdjustedRule(upeerId, messageType, rule);

        // Get or create identity bucket
        const now = Date.now();
        if (!this.identityBuckets.has(upeerId)) {
            this.identityBuckets.set(upeerId, new Map());
        }
        const identityBuckets = this.identityBuckets.get(upeerId)!;

        if (!identityBuckets.has(messageType)) {
            identityBuckets.set(messageType, {
                tokens: adjustedRule.maxTokens,
                lastRefill: now
            });
        }

        const bucket = identityBuckets.get(messageType)!;

        // Refill tokens based on elapsed time
        const elapsedMs = now - bucket.lastRefill;
        if (elapsedMs > 0) {
            const refillTokens = elapsedMs * (adjustedRule.refillRate / 1000);
            bucket.tokens = Math.min(adjustedRule.maxTokens, bucket.tokens + refillTokens);
            bucket.lastRefill = now;
        }

        // Check if we have at least 1 token
        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            return true;
        }

        // Identity rate limited
        warn('Identity rate limited', {
            upeerId,
            messageType,
            tokens: bucket.tokens.toFixed(2)
        }, 'rate-limiter');
        return false;
    }

    /**
     * Check if a message from given IP and identity is allowed
     * Applies both IP-based and identity-based rate limiting
     * Identity limits are adjusted based on reputation score
     */
    checkIdentity(ip: string, upeerId: string, messageType: string): boolean {
        // En handlers.ts ya llamamos a checkIp (super.check) antes de esto.
        // Llamar aquí a super.check de nuevo causaría que cada paquete consuma 2 tokens.
        // Solo aplicamos la lógica de identidad.
        return this.checkIdentityOnly(upeerId, messageType);
    }

    /**
     * Get reputation-adjusted rate limit rule
     * BUG BF fix: antes se pasaba `new Set<string>()` como directContactIds, lo que hace
     * que computeScorePure filtre TODOS los vouches (sólo cuentan de contactos directos),
     * devolviendo siempre 50 → multiplicador siempre 1.0 → reputación nunca ajusta límites.
     * Ahora usamos una caché de 60s con los contactos reales para que la protección Sybil
     * y el ajuste de cuota funcionen correctamente sin consultar la DB en cada paquete.
     */
    private getAdjustedRule(upeerId: string, _messageType: string, baseRule: RateLimitConfig): RateLimitConfig {
        const vouchScore = computeScore(upeerId, _cachedDirectIds);
        const reputationMultiplier = this.calculateReputationMultiplier(vouchScore);

        const adjustedMaxTokens = Math.max(1, Math.floor(baseRule.maxTokens * reputationMultiplier));
        const adjustedRefillRate = baseRule.refillRate * reputationMultiplier;

        return {
            windowMs: baseRule.windowMs,
            maxTokens: adjustedMaxTokens,
            refillRate: adjustedRefillRate
        };
    }

    /**
     * Calculate reputation multiplier based on weightedScore (0-100)
     * Returns multiplier between 0.1 and 3.0
     */
    private calculateReputationMultiplier(score: number): number {
        // Map score to multiplier using a sigmoid-like curve
        // Score 0 -> multiplier 0.1 (very restrictive)
        // Score 50 -> multiplier 1.0 (normal)
        // Score 100 -> multiplier 3.0 (generous)

        if (score <= 0) return 0.1;
        if (score >= 100) return 3.0;

        // Linear interpolation for simplicity
        if (score <= 50) {
            // 0-50: 0.1 to 1.0
            return 0.1 + (score / 50) * 0.9;
        } else {
            // 50-100: 1.0 to 3.0
            return 1.0 + ((score - 50) / 50) * 2.0;
        }
    }

    /**
     * Reset rate limits for a specific identity
     */
    resetIdentity(upeerId: string): void {
        this.identityBuckets.delete(upeerId);
    }

    /**
     * Reset rate limits for a specific IP (overrides parent method to also clean identity mappings)
     */
    override resetIp(ip: string): void {
        super.resetIp(ip);
        // Note: We don't clear identity buckets because same identity could use different IPs
    }

    /**
     * Get current token count for identity (for debugging/monitoring)
     */
    getIdentityTokenCount(upeerId: string, messageType: string): number {
        const identityBuckets = this.identityBuckets.get(upeerId);
        if (!identityBuckets) return 0;
        const bucket = identityBuckets.get(messageType);
        return bucket ? bucket.tokens : 0;
    }

    /**
     * Clean up old identity entries to prevent memory leak
     */
    cleanupIdentities(maxAgeMs: number = 3600000): void {
        const now = Date.now();
        const toDelete: string[] = [];

        for (const [upeerId, identityBuckets] of this.identityBuckets.entries()) {
            let hasActivity = false;
            for (const bucket of identityBuckets.values()) {
                if (now - bucket.lastRefill < maxAgeMs) {
                    hasActivity = true;
                    break;
                }
            }
            if (!hasActivity) {
                toDelete.push(upeerId);
            }
        }

        for (const upeerId of toDelete) {
            this.identityBuckets.delete(upeerId);
        }
    }

    /**
     * Perform complete cleanup (IPs and identities)
     */
    override cleanup(maxAgeMs: number = 3600000): void {
        super.cleanup(maxAgeMs);
        this.cleanupIdentities(maxAgeMs);
    }

    /**
     * Get statistics about identity rate limiting
     */
    getIdentityStats(): { totalIdentities: number; totalIdentityBuckets: number } {
        let totalBuckets = 0;
        for (const identityBuckets of this.identityBuckets.values()) {
            totalBuckets += identityBuckets.size;
        }

        return {
            totalIdentities: this.identityBuckets.size,
            totalIdentityBuckets: totalBuckets
        };
    }
}

// Re-export RateLimitConfig for convenience
export type { RateLimitConfig } from './rate-limiter.js';