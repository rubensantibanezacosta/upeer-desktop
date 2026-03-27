import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdentityRateLimiter } from '../../../src/main_process/security/identity-rate-limiter';
import * as reputation from '../../../src/main_process/security/reputation/vouches';

type IdentityBucket = {
    tokens: number;
    lastRefill: number;
};
type IdentityRateLimiterInternals = IdentityRateLimiter & {
    identityBuckets: Map<string, Map<string, IdentityBucket>>;
};

vi.mock('../../../src/main_process/security/reputation/vouches', () => ({
    computeScore: vi.fn(() => 50),
    getDirectContactIds: vi.fn(async () => new Set(['direct-peer'])),
}));

vi.mock('../../../src/main_process/storage/contacts/operations', () => ({
    getContacts: vi.fn(() => []),
}));

vi.mock('../../../src/main_process/security/secure-logger', () => ({
    warn: vi.fn(),
    error: vi.fn(),
}));

describe('IdentityRateLimiter', () => {
    let limiter: IdentityRateLimiter;

    async function warmDirectContacts(l: IdentityRateLimiter): Promise<void> {
        l.checkIdentityOnly('warmup-peer', 'TEST_TYPE');
        await Promise.resolve();
    }

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        limiter = new IdentityRateLimiter({
            'TEST_TYPE': { windowMs: 1000, maxTokens: 2, refillRate: 1 }
        });
    });

    it('should allow messages within limits', () => {
        expect(limiter.checkIdentityOnly('peer1', 'TEST_TYPE')).toBe(true);
        expect(limiter.checkIdentityOnly('peer1', 'TEST_TYPE')).toBe(true);
    });

    it('should block messages exceeding limits', () => {
        limiter.checkIdentityOnly('peer1', 'TEST_TYPE');
        limiter.checkIdentityOnly('peer1', 'TEST_TYPE');
        expect(limiter.checkIdentityOnly('peer1', 'TEST_TYPE')).toBe(false);
    });

    it('should allow if no rule', () => {
        expect(limiter.checkIdentityOnly('p', 'UNK')).toBe(true);
    });

    it('should adjust limits correctly', async () => {
        vi.mocked(reputation.computeScore).mockReturnValue(95);
        const l = new IdentityRateLimiter({ 'T': { windowMs: 1000, maxTokens: 10, refillRate: 1 } });
        await warmDirectContacts(l);
        let c = 0; while (l.checkIdentityOnly('p', 'T')) c++;
        expect(c).toBe(30);

        vi.mocked(reputation.computeScore).mockReturnValue(10);
        const l2 = new IdentityRateLimiter({ 'T': { windowMs: 1000, maxTokens: 10, refillRate: 1 } });
        await warmDirectContacts(l2);
        let c2 = 0; while (l2.checkIdentityOnly('p', 'T')) c2++;
        expect(c2).toBe(1);
    });

    it('should refill tokens', async () => {
        const l = new IdentityRateLimiter({ 'F': { windowMs: 100, maxTokens: 10, refillRate: 100 } });
        // Consumimos 10 tokens
        for (let i = 0; i < 10; i++) l.checkIdentityOnly('p', 'F');

        expect(l.checkIdentityOnly('p', 'F')).toBe(false);

        const buckets = (l as IdentityRateLimiterInternals).identityBuckets.get('p');
        expect(buckets).toBeDefined();
        if (!buckets) throw new Error('Missing buckets');
        const bucket = buckets.get('F');
        expect(bucket).toBeDefined();
        if (!bucket) throw new Error('Missing bucket');
        bucket.lastRefill = Date.now() - 500;

        expect(l.checkIdentityOnly('p', 'F')).toBe(true);
    });

    it('should cleanup', () => {
        limiter.checkIdentityOnly('p', 'TEST_TYPE');
        const buckets = (limiter as IdentityRateLimiterInternals).identityBuckets;
        const peerBuckets = buckets.get('p');
        expect(peerBuckets).toBeDefined();
        if (!peerBuckets) throw new Error('Missing peer buckets');
        const bucket = peerBuckets.get('TEST_TYPE');
        expect(bucket).toBeDefined();
        if (!bucket) throw new Error('Missing TEST_TYPE bucket');

        bucket.lastRefill -= 3600001;
        limiter.cleanup();

        expect(limiter.checkIdentityOnly('p', 'TEST_TYPE')).toBe(true);
    });

    it('should delegate checkIp', () => {
        expect(limiter.checkIp('1.2.3.4', 'TEST_TYPE')).toBe(true);
    });

    it('should adjust limits accurately by scoring ranges', async () => {
        const testRanges = [
            { score: 95, expectedCap: 3.0 },
            { score: 75, expectedCap: 1.5 },
            { score: 55, expectedCap: 1.0 },
            { score: 35, expectedCap: 0.5 },
            { score: 10, expectedCap: 0.1 }
        ];

        for (const range of testRanges) {
            vi.mocked(reputation.computeScore).mockReturnValue(range.score);
            const l = new IdentityRateLimiter({ 'T': { windowMs: 1000, maxTokens: 100, refillRate: 10 } });
            await warmDirectContacts(l);

            l.checkIdentityOnly('p', 'T');
            const buckets = (l as IdentityRateLimiterInternals).identityBuckets.get('p');
            expect(buckets).toBeDefined();
            if (!buckets) throw new Error('Missing buckets');
            const bucket = buckets.get('T');
            expect(bucket).toBeDefined();
            if (!bucket) throw new Error('Missing T bucket');

            const expectedTokens = Math.max(1, Math.floor(100 * range.expectedCap));
            expect(bucket.tokens).toBeCloseTo(expectedTokens - 1, 1);
        }
    });

    it('should return true if identityBuckets Map retrieval fails unexpectedly', () => {
        limiter.checkIdentityOnly('p1', 'TEST_TYPE');
        const bucketsMap = (limiter as IdentityRateLimiterInternals).identityBuckets;
        vi.spyOn(bucketsMap, 'get').mockReturnValue(undefined);

        expect(limiter.checkIdentityOnly('p1', 'TEST_TYPE')).toBe(true);
    });
});
