import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { IdentityRateLimiter } from '../src/main_process/security/identity-rate-limiter.js';
import { SocialReputation, ReputationScore } from '../src/main_process/security/reputation.js';

// Mock SocialReputation for testing
class MockSocialReputation extends SocialReputation {
    private mockScores: Map<string, ReputationScore> = new Map();
    
    setReputation(revelnestId: string, score: ReputationScore): void {
        this.mockScores.set(revelnestId, score);
    }
    
    override calculateReputation(revelnestId: string): ReputationScore {
        const score = this.mockScores.get(revelnestId);
        if (score) {
            return score;
        }
        // Default score (neutral reputation)
        return {
            trustScore: 50,
            centrality: 50,
            activityScore: 50,
            connectionCount: 5,
            weightedScore: 50
        };
    }
    
    override addConnection(nodeA: string, nodeB: string): void {
        // No-op for tests
    }
    
    override logActivity(nodeId: string, activityType: any, details?: any): void {
        // No-op for tests
    }
}

describe('IdentityRateLimiter', () => {
    let rateLimiter: IdentityRateLimiter;
    let mockReputation: MockSocialReputation;
    
    beforeEach(() => {
        mockReputation = new MockSocialReputation();
        rateLimiter = new IdentityRateLimiter(undefined, mockReputation);
    });
    
    it('should allow messages within rate limit by identity', () => {
        const ip = '200:1234:5678::1';
        const revelnestId = 'test-id-123';
        const messageType = 'PING';
        
        // Set neutral reputation (score 50 = multiplier 1.0)
        mockReputation.setReputation(revelnestId, {
            trustScore: 50,
            centrality: 50,
            activityScore: 50,
            connectionCount: 5,
            weightedScore: 50
        });
        
        // First 60 should be allowed (PING limit is 60 per 10 seconds)
        for (let i = 0; i < 60; i++) {
            assert.strictEqual(rateLimiter.checkIdentity(ip, revelnestId, messageType), true);
        }
    });
    
    it('should block messages exceeding rate limit by identity', () => {
        const ip = '200:1234:5678::2';
        const revelnestId = 'test-id-456';
        const messageType = 'PING';
        
        // Set neutral reputation
        mockReputation.setReputation(revelnestId, {
            trustScore: 50,
            centrality: 50,
            activityScore: 50,
            connectionCount: 5,
            weightedScore: 50
        });
        
        // Consume all tokens
        for (let i = 0; i < 60; i++) {
            rateLimiter.checkIdentity(ip, revelnestId, messageType);
        }
        
        // 61st should be blocked
        assert.strictEqual(rateLimiter.checkIdentity(ip, revelnestId, messageType), false);
    });
    
    it('should have different limits for different identities', () => {
        const id1 = 'id-1';
        const id2 = 'id-2';
        const messageType = 'PING';
        
        // Both with neutral reputation
        mockReputation.setReputation(id1, {
            trustScore: 50, weightedScore: 50, centrality: 50, activityScore: 50, connectionCount: 5
        });
        mockReputation.setReputation(id2, {
            trustScore: 50, weightedScore: 50, centrality: 50, activityScore: 50, connectionCount: 5
        });
        
        // Use different IPs for each identity to avoid IP limiting interference
        const ip1 = '200:1234:5678::3a';
        const ip2 = '200:1234:5678::3b';
        
        // Consume all tokens for id1 using ip1
        for (let i = 0; i < 60; i++) {
            rateLimiter.checkIdentity(ip1, id1, messageType);
        }
        
        // id1 should be blocked (IP bucket also empty)
        assert.strictEqual(rateLimiter.checkIdentity(ip1, id1, messageType), false);
        
        // id2 should still work with different IP (different IP bucket, different identity bucket)
        assert.strictEqual(rateLimiter.checkIdentity(ip2, id2, messageType), true);
        
        // Also test identity-only limits: after consuming id1's identity tokens,
        // id2's identity bucket should still be full
        // Reset IP buckets first
        rateLimiter.resetIp(ip1);
        rateLimiter.resetIp(ip2);
        // Consume id1's identity tokens using checkIdentityOnly
        for (let i = 0; i < 60; i++) {
            rateLimiter.checkIdentityOnly(id1, messageType);
        }
        // id1 identity should be blocked
        assert.strictEqual(rateLimiter.checkIdentityOnly(id1, messageType), false);
        // id2 identity should still work
        assert.strictEqual(rateLimiter.checkIdentityOnly(id2, messageType), true);
    });
    
    it('should apply IP-based limiting as first layer', () => {
        const ip = '200:1234:5678::4';
        const id1 = 'id-1';
        const id2 = 'id-2';
        const messageType = 'PING';
        
        // Consume IP tokens using id1
        for (let i = 0; i < 60; i++) {
            rateLimiter.checkIdentity(ip, id1, messageType);
        }
        
        // IP should be blocked regardless of identity
        assert.strictEqual(rateLimiter.checkIdentity(ip, id2, messageType), false);
        
        // But different IP should work
        assert.strictEqual(rateLimiter.checkIdentity('200:1234:5678::5', id2, messageType), true);
    });
    
    it('should adjust limits based on reputation score', () => {
        const lowRepId = 'low-rep-id';
        const highRepId = 'high-rep-id';
        const messageType = 'HANDSHAKE_REQ'; // Base limit: 5 per minute
        
        // Low reputation (score 10 -> multiplier ~0.28)
        mockReputation.setReputation(lowRepId, {
            trustScore: 10,
            centrality: 10,
            activityScore: 10,
            connectionCount: 1,
            weightedScore: 10
        });
        
        // High reputation (score 90 -> multiplier ~2.6)
        mockReputation.setReputation(highRepId, {
            trustScore: 90,
            centrality: 90,
            activityScore: 90,
            connectionCount: 20,
            weightedScore: 90
        });
        
        // Test low reputation using checkIdentityOnly (identity limit only)
        let lowRepAllowed = 0;
        for (let i = 0; i < 10; i++) {
            if (rateLimiter.checkIdentityOnly(lowRepId, messageType)) {
                lowRepAllowed++;
            }
        }
        
        // Test high reputation using checkIdentityOnly
        let highRepAllowed = 0;
        for (let i = 0; i < 20; i++) {
            if (rateLimiter.checkIdentityOnly(highRepId, messageType)) {
                highRepAllowed++;
            }
        }
        
        // Low reputation should have at least 1 but less than base limit
        assert.ok(lowRepAllowed >= 1 && lowRepAllowed < 5,
            `Low rep should have reduced limit, got ${lowRepAllowed}`);
            
        // High reputation should have more than base limit
        assert.ok(highRepAllowed > 5,
            `High rep should have increased limit, got ${highRepAllowed}`);
        
        // High reputation should allow more messages than low reputation
        assert.ok(highRepAllowed > lowRepAllowed, 
            `High rep (${highRepAllowed}) should allow more than low rep (${lowRepAllowed})`);
        
        // Verify specific expected values (with tolerance)
        // Low rep multiplier ~0.28 => maxTokens ~1.4 -> floor 1
        assert.strictEqual(lowRepAllowed, 1, `Low rep should allow exactly 1 message`);
        // High rep multiplier ~2.6 => maxTokens ~13 -> floor 13
        assert.ok(highRepAllowed >= 12 && highRepAllowed <= 13, 
            `High rep should allow ~13 messages, got ${highRepAllowed}`);
    });
    
    it('should handle extremely low reputation (near zero)', () => {
        const ip = '200:1234:5678::7';
        const zeroRepId = 'zero-rep-id';
        const messageType = 'PING'; // Base limit: 60 per 10 seconds
        
        // Extremely low reputation (score 0 -> multiplier 0.1)
        mockReputation.setReputation(zeroRepId, {
            trustScore: 0,
            centrality: 0,
            activityScore: 0,
            connectionCount: 0,
            weightedScore: 0
        });
        
        // Should allow at least 1 message (min tokens = 1)
        assert.strictEqual(rateLimiter.checkIdentity(ip, zeroRepId, messageType), true);
        
        // Should block quickly after first message
        let allowedCount = 1;
        for (let i = 0; i < 10; i++) {
            if (rateLimiter.checkIdentity(ip, zeroRepId, messageType)) {
                allowedCount++;
            }
        }
        
        // With multiplier 0.1, maxTokens = 60 * 0.1 = 6 tokens
        assert.ok(allowedCount <= 6, `Zero rep should have ~6 tokens max, got ${allowedCount}`);
    });
    
    it('should handle extremely high reputation (near 100)', () => {
        const perfectRepId = 'perfect-rep-id';
        const messageType = 'PING'; // Base limit: 60 per 10 seconds
        
        // Perfect reputation (score 100 -> multiplier 3.0)
        mockReputation.setReputation(perfectRepId, {
            trustScore: 100,
            centrality: 100,
            activityScore: 100,
            connectionCount: 50,
            weightedScore: 100
        });
        
        // Use checkIdentityOnly to test identity limits independently of IP
        // First consume IP tokens using different IPs to avoid IP limiting
        let allowedCount = 0;
        for (let i = 0; i < 200; i++) { // More than expected
            // Use different IP for each call to avoid IP rate limiting
            const ip = `200:1234:5678::8${i}`; // Unique IP per call
            if (rateLimiter.checkIdentity(ip, perfectRepId, messageType)) {
                allowedCount++;
            } else {
                // When identity bucket is empty, stop
                break;
            }
        }
        
        // With multiplier 3.0, maxTokens = 60 * 3 = 180 tokens
        // Allow some tolerance for floating point math
        assert.ok(allowedCount >= 170 && allowedCount <= 180, 
            `Perfect rep should have ~180 tokens, got ${allowedCount}`);
    });
    
    it('should reset identity buckets', () => {
        const ip = '200:1234:5678::9';
        const revelnestId = 'reset-test-id';
        const messageType = 'PING';
        
        // Consume all tokens (both IP and identity)
        for (let i = 0; i < 60; i++) {
            rateLimiter.checkIdentity(ip, revelnestId, messageType);
        }
        
        // Should be blocked (IP bucket empty)
        assert.strictEqual(rateLimiter.checkIdentity(ip, revelnestId, messageType), false);
        
        // Reset identity AND IP
        rateLimiter.resetIdentity(revelnestId);
        rateLimiter.resetIp(ip);
        
        // Should work again
        assert.strictEqual(rateLimiter.checkIdentity(ip, revelnestId, messageType), true);
    });
    
    it('should get identity token count', () => {
        const ip = '200:1234:5678::a';
        const revelnestId = 'token-count-id';
        const messageType = 'PING';
        
        // Initially no bucket exists, so token count is 0
        assert.strictEqual(rateLimiter.getIdentityTokenCount(revelnestId, messageType), 0);
        
        // After first check, bucket created with adjusted max tokens
        rateLimiter.checkIdentity(ip, revelnestId, messageType);
        const afterTokens = rateLimiter.getIdentityTokenCount(revelnestId, messageType);
        
        // With neutral reputation (multiplier 1.0), should be 59 (60 - 1)
        assert.strictEqual(afterTokens, 59);
    });
    
    it('should cleanup old identity entries', () => {
        const ip1 = '200:1234:5678::b';
        const ip2 = '200:1234:5678::c';
        const id1 = 'old-id';
        const id2 = 'new-id';
        const messageType = 'PING';
        
        // Create activity for id1
        rateLimiter.checkIdentity(ip1, id1, messageType);
        
        // Mock Date.now to simulate time passing
        const originalDateNow = Date.now;
        let mockTime = Date.now() + 7200000; // 2 hours later
        Date.now = () => mockTime;
        
        try {
            // id1's bucket is old, id2 is new
            rateLimiter.checkIdentity(ip2, id2, messageType);
            
            // Cleanup entries older than 1 hour
            rateLimiter.cleanup(3600000);
            
            // id1 should have been removed (no bucket)
            assert.strictEqual(rateLimiter.getIdentityTokenCount(id1, messageType), 0);
            
            // id2 should still exist
            assert.strictEqual(rateLimiter.getIdentityTokenCount(id2, messageType), 59);
        } finally {
            Date.now = originalDateNow;
        }
    });
    
    it('should handle messages without identity (fallback to IP only)', () => {
        const ip = '200:1234:5678::d';
        const messageType = 'PING';
        
        // Use checkIp (IP-only) for backward compatibility
        // First 60 should be allowed
        for (let i = 0; i < 60; i++) {
            assert.strictEqual(rateLimiter.checkIp(ip, messageType), true);
        }
        
        // 61st should be blocked
        assert.strictEqual(rateLimiter.checkIp(ip, messageType), false);
    });
    
    it('should maintain separate buckets for identity vs IP', () => {
        const ip = '200:1234:5678::e';
        const revelnestId = 'separate-test-id';
        const otherId = 'other-id';
        const messageType = 'PING';
        
        // First, create identity bucket for revelnestId (give it some tokens)
        rateLimiter.checkIdentity(ip, revelnestId, messageType); // Uses 1 token from IP and identity
        
        // Now exhaust IP limit using different identity
        for (let i = 0; i < 59; i++) { // 59 more to exhaust IP bucket (total 60)
            rateLimiter.checkIdentity(ip, otherId, messageType);
        }
        
        // IP should be blocked (0 tokens)
        assert.strictEqual(rateLimiter.checkIp(ip, messageType), false);
        
        // Identity bucket for revelnestId should still have tokens (59 left)
        const identityTokens = rateLimiter.getIdentityTokenCount(revelnestId, messageType);
        const ipTokens = rateLimiter.getTokenCount(ip, messageType);
        
        // IP tokens should be 0, identity tokens should be 59 (or at least > 0)
        assert.strictEqual(ipTokens, 0, 'IP bucket should be empty');
        assert.ok(identityTokens > 0, `Identity bucket should have tokens, got ${identityTokens}`);
        assert.ok(identityTokens !== ipTokens, 'Identity and IP buckets should be separate');
    });
    
    it('should work with custom rate limit rules', () => {
        const ip = '200:1234:5678::f';
        const revelnestId = 'custom-rules-id';
        const messageType = 'CUSTOM_TYPE';
        
        // Add custom rule
        rateLimiter.updateRules({
            'CUSTOM_TYPE': { windowMs: 60000, maxTokens: 10, refillRate: 10/60 }
        });
        
        // Test with custom rule
        for (let i = 0; i < 10; i++) {
            assert.strictEqual(rateLimiter.checkIdentity(ip, revelnestId, messageType), true);
        }
        
        // 11th should be blocked
        assert.strictEqual(rateLimiter.checkIdentity(ip, revelnestId, messageType), false);
    });
    
    it('should inherit all functionality from base RateLimiter', () => {
        // Test that parent class methods still work
        const ip = '200:1234:5678::g';
        const messageType = 'PING';
        
        // Test check (inherited) - should work the same as checkIp
        for (let i = 0; i < 60; i++) {
            assert.strictEqual(rateLimiter.check(ip, messageType), true);
        }
        assert.strictEqual(rateLimiter.check(ip, messageType), false);
        
        // Test getTokenCount (inherited)
        rateLimiter.resetIp(ip);
        assert.strictEqual(rateLimiter.getTokenCount(ip, messageType), 0);
        rateLimiter.check(ip, messageType);
        assert.strictEqual(rateLimiter.getTokenCount(ip, messageType), 59);
    });
});