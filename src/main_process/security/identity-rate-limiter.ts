/**
 * Identity-based Rate Limiter with reputation integration
 * Extends the base RateLimiter to add identity-based limiting and reputation-aware limits
 */

import { RateLimiter, RateLimitRule, RateLimitConfig } from './rate-limiter.js';
import { getReputationSystem, ReputationScore, SocialReputation } from './reputation.js';
import { warn } from './secure-logger.js';

interface IdentityTokenBucket {
    tokens: number;
    lastRefill: number;
}

export class IdentityRateLimiter extends RateLimiter {
    private identityBuckets: Map<string, Map<string, IdentityTokenBucket>> = new Map(); // revelnestId -> messageType -> bucket
    private reputationSystem: SocialReputation;

    constructor(rules?: RateLimitRule, reputationSystem?: SocialReputation) {
        super(rules);
        this.reputationSystem = reputationSystem || getReputationSystem();
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
    checkIdentityOnly(revelnestId: string, messageType: string): boolean {
        if (!revelnestId) {
            // No identity, cannot apply identity-based limiting
            return true;
        }

        const rule = (this as any).rules[messageType];
        if (!rule) {
            // No rule for this message type = unlimited
            return true;
        }

        // Calculate reputation-adjusted limit
        const adjustedRule = this.getAdjustedRule(revelnestId, messageType, rule);

        // Get or create identity bucket
        const now = Date.now();
        if (!this.identityBuckets.has(revelnestId)) {
            this.identityBuckets.set(revelnestId, new Map());
        }
        const identityBuckets = this.identityBuckets.get(revelnestId)!;

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
            revelnestId,
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
    checkIdentity(ip: string, revelnestId: string, messageType: string): boolean {
        // En handlers.ts ya llamamos a checkIp (super.check) antes de esto.
        // Llamar aquí a super.check de nuevo causaría que cada paquete consuma 2 tokens.
        // Solo aplicamos la lógica de identidad.
        return this.checkIdentityOnly(revelnestId, messageType);
    }

    /**
     * Get reputation-adjusted rate limit rule
     */
    private getAdjustedRule(revelnestId: string, messageType: string, baseRule: RateLimitConfig): RateLimitConfig {
        const reputation = this.reputationSystem.calculateReputation(revelnestId);
        const reputationMultiplier = this.calculateReputationMultiplier(reputation);

        // Apply multiplier to maxTokens and refillRate
        // Minimum multiplier is 0.1 (10% of base limit) for very low reputation
        // Maximum multiplier is 3.0 (300% of base limit) for high reputation
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
    private calculateReputationMultiplier(reputation: ReputationScore): number {
        const score = reputation.weightedScore;

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
    resetIdentity(revelnestId: string): void {
        this.identityBuckets.delete(revelnestId);
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
    getIdentityTokenCount(revelnestId: string, messageType: string): number {
        const identityBuckets = this.identityBuckets.get(revelnestId);
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

        for (const [revelnestId, identityBuckets] of this.identityBuckets.entries()) {
            let hasActivity = false;
            for (const bucket of identityBuckets.values()) {
                if (now - bucket.lastRefill < maxAgeMs) {
                    hasActivity = true;
                    break;
                }
            }
            if (!hasActivity) {
                toDelete.push(revelnestId);
            }
        }

        for (const revelnestId of toDelete) {
            this.identityBuckets.delete(revelnestId);
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