import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdentityRateLimiter } from '../../../src/main_process/security/identity-rate-limiter';
import * as reputation from '../../../src/main_process/security/reputation/vouches';

vi.mock('../../../src/main_process/security/reputation/vouches', () => ({
    computeScore: vi.fn(() => 50),
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

    it('should adjust limits correctly', () => {
        (reputation.computeScore as any).mockReturnValue(95);
        const l = new IdentityRateLimiter({ 'T': { windowMs: 1000, maxTokens: 10, refillRate: 1 } });
        let c = 0; while (l.checkIdentityOnly('p', 'T')) c++;
        expect(c).toBe(30);

        (reputation.computeScore as any).mockReturnValue(10);
        const l2 = new IdentityRateLimiter({ 'T': { windowMs: 1000, maxTokens: 10, refillRate: 1 } });
        let c2 = 0; while (l2.checkIdentityOnly('p', 'T')) c2++;
        expect(c2).toBe(1);
    });

    it('should refill tokens', async () => {
        const l = new IdentityRateLimiter({ 'F': { windowMs: 100, maxTokens: 10, refillRate: 100 } });
        // Consumimos 10 tokens
        for (let i = 0; i < 10; i++) l.checkIdentityOnly('p', 'F');

        // Ahora debería estar en 0 (o casi 0)
        expect(l.checkIdentityOnly('p', 'F')).toBe(false);

        // Manipulación manual de lastRefill para simular paso de tiempo
        const buckets = (l as any).identityBuckets.get('p');
        const bucket = buckets.get('F');
        // windowMs=100ms, maxTokens=10 -> 0.1 tokens/ms
        // Retrocedemos 500ms -> +50 tokens (se limita a maxTokens=10)
        bucket.lastRefill = Date.now() - 500;

        expect(l.checkIdentityOnly('p', 'F')).toBe(true);
    });

    it('should cleanup', () => {
        limiter.checkIdentityOnly('p', 'TEST_TYPE');
        const buckets = (limiter as any).identityBuckets;
        const peerBuckets = buckets.get('p');
        const bucket = peerBuckets.get('TEST_TYPE');

        bucket.lastRefill -= 3600001;
        limiter.cleanup();

        // El bucket desaparece. Al llamar de nuevo, se crea uno nuevo con tokens=maxTokens
        expect(limiter.checkIdentityOnly('p', 'TEST_TYPE')).toBe(true);
    });

    it('should delegate checkIp', () => {
        expect(limiter.checkIp('1.2.3.4', 'TEST_TYPE')).toBe(true);
    });

    it('should adjust limits accurately by scoring ranges', () => {
        const testRanges = [
            { score: 95, expectedCap: 3.0 },
            { score: 75, expectedCap: 1.5 },
            { score: 55, expectedCap: 1.0 },
            { score: 35, expectedCap: 0.5 },
            { score: 10, expectedCap: 0.1 }
        ];

        testRanges.forEach(range => {
            (reputation.computeScore as any).mockReturnValue(range.score);
            const l = new IdentityRateLimiter({ 'T': { windowMs: 1000, maxTokens: 100, refillRate: 10 } });

            // Provocamos la creación del bucket para ver los tokens iniciales
            l.checkIdentityOnly('p', 'T');
            const buckets = (l as any).identityBuckets.get('p');
            const bucket = buckets.get('T');

            // Los tokens iniciales son adjustedMaxTokens
            // Usamos un margen de error pequeño por el Math.floor y max(1, ...)
            const expectedTokens = Math.max(1, Math.floor(100 * range.expectedCap));
            // Como ya consumimos 1 en checkIdentityOnly, quedan expected - 1
            expect(bucket.tokens).toBeCloseTo(expectedTokens - 1, 1);
        });
    });

    it('should return true if identityBuckets Map retrieval fails unexpectedly', () => {
        limiter.checkIdentityOnly('p1', 'TEST_TYPE');
        const bucketsMap = (limiter as any).identityBuckets;
        vi.spyOn(bucketsMap, 'get').mockReturnValue(undefined);

        expect(limiter.checkIdentityOnly('p1', 'TEST_TYPE')).toBe(true);
    });
});
