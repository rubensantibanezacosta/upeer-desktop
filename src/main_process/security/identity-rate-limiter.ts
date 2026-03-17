import { RateLimiter, RateLimitRule, RateLimitConfig } from './rate-limiter.js';
import { computeScore } from './reputation/vouches.js';
import { warn } from './secure-logger.js';

interface IdentityTokenBucket {
    tokens: number;
    lastRefill: number;
}

let _cachedDirectIds: Set<string> = new Set();
let _cacheTs: number = 0;
const _CACHE_TTL = 60_000;

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
    } catch { }
    return _cachedDirectIds;
}

export class IdentityRateLimiter extends RateLimiter {
    private identityBuckets: Map<string, Map<string, IdentityTokenBucket>> = new Map();

    constructor(rules?: RateLimitRule) {
        super(rules);
    }

    checkIp(ip: string, messageType: string): boolean {
        return super.check(ip, messageType);
    }

    checkIdentityOnly(upeerId: string, messageType: string): boolean {
        if (!upeerId) return true;

        if (Date.now() - _cacheTs >= _CACHE_TTL) {
            _getDirectContactIds().catch((err) => warn('Failed to get direct contact IDs', err, 'rate-limiter'));
        }

        const rule = (this as any).rules[messageType];
        if (!rule) return true;

        const adjustedRule = this.getAdjustedRule(upeerId, messageType, rule);
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
        const elapsedMs = now - bucket.lastRefill;
        if (elapsedMs > 0) {
            const refillTokens = elapsedMs * (adjustedRule.refillRate / 1000);
            bucket.tokens = Math.min(adjustedRule.maxTokens, bucket.tokens + refillTokens);
            bucket.lastRefill = now;
        }

        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            return true;
        }

        warn('Identity rate limited', {
            upeerId,
            messageType,
            tokens: bucket.tokens.toFixed(2)
        }, 'rate-limiter');
        return false;
    }

    checkIdentity(ip: string, upeerId: string, messageType: string): boolean {
        return this.checkIdentityOnly(upeerId, messageType);
    }

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

    private calculateReputationMultiplier(score: number): number {
        if (score >= 90) return 3.0;
        if (score >= 70) return 1.5;
        if (score >= 50) return 1.0;
        if (score >= 30) return 0.5;
        return 0.1;
    }

    cleanup(): void {
        const now = Date.now();
        for (const [upeerId, buckets] of this.identityBuckets.entries()) {
            for (const [type, bucket] of buckets.entries()) {
                if (now - bucket.lastRefill > 3600000) {
                    buckets.delete(type);
                }
            }
            if (buckets.size === 0) {
                this.identityBuckets.delete(upeerId);
            }
        }
        super.cleanup();
    }
}
