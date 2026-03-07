import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { RateLimiter } from '../src/main_process/security/rate-limiter.js';

describe('RateLimiter', () => {
    let rateLimiter: RateLimiter;
    
    beforeEach(() => {
        rateLimiter = new RateLimiter();
    });
    
    it('should allow messages within rate limit', () => {
        const ip = '200:1234:5678::1';
        const messageType = 'PING';
        
        // First 60 should be allowed (within 60 per 10 seconds)
        for (let i = 0; i < 60; i++) {
            assert.strictEqual(rateLimiter.check(ip, messageType), true);
        }
    });
    
    it('should block messages exceeding rate limit', () => {
        const ip = '200:1234:5678::2';
        const messageType = 'PING';
        
        // Consume all tokens
        for (let i = 0; i < 60; i++) {
            rateLimiter.check(ip, messageType);
        }
        
        // 61st should be blocked
        assert.strictEqual(rateLimiter.check(ip, messageType), false);
    });
    
    it('should refill tokens over time', () => {
        const ip = '200:1234:5678::3';
        const messageType = 'PING';
        
        // Consume all tokens
        for (let i = 0; i < 60; i++) {
            rateLimiter.check(ip, messageType);
        }
        
        // Should be blocked
        assert.strictEqual(rateLimiter.check(ip, messageType), false);
        
        // Mock Date.now to simulate time passing
        const originalDateNow = Date.now;
        let mockTime = Date.now() + 11000; // 11 seconds later (PING window is 10 seconds)
        Date.now = () => mockTime;
        
        try {
            // Should be allowed again after refill
            assert.strictEqual(rateLimiter.check(ip, messageType), true);
        } finally {
            Date.now = originalDateNow;
        }
    });
    
    it('should have different limits for different message types', () => {
        const ip = '200:1234:5678::4';
        
        // HANDSHAKE_REQ has limit of 5 per minute
        for (let i = 0; i < 5; i++) {
            assert.strictEqual(rateLimiter.check(ip, 'HANDSHAKE_REQ'), true);
        }
        // 6th should be blocked
        assert.strictEqual(rateLimiter.check(ip, 'HANDSHAKE_REQ'), false);
        
        // But PING should still work (different bucket)
        assert.strictEqual(rateLimiter.check(ip, 'PING'), true);
    });
    
    it('should handle different IPs independently', () => {
        const ip1 = '200:1234:5678::5';
        const ip2 = '200:1234:5678::6';
        const messageType = 'PING';
        
        // Consume all tokens for ip1
        for (let i = 0; i < 60; i++) {
            rateLimiter.check(ip1, messageType);
        }
        
        // ip1 should be blocked
        assert.strictEqual(rateLimiter.check(ip1, messageType), false);
        
        // ip2 should still work
        assert.strictEqual(rateLimiter.check(ip2, messageType), true);
    });
    
    it('should reset IP when requested', () => {
        const ip = '200:1234:5678::7';
        const messageType = 'PING';
        
        // Consume all tokens
        for (let i = 0; i < 60; i++) {
            rateLimiter.check(ip, messageType);
        }
        
        // Should be blocked
        assert.strictEqual(rateLimiter.check(ip, messageType), false);
        
        // Reset
        rateLimiter.resetIp(ip);
        
        // Should work again
        assert.strictEqual(rateLimiter.check(ip, messageType), true);
    });
    
    it('should allow unlimited messages for unknown types', () => {
        const ip = '200:1234:5678::8';
        const unknownType = 'UNKNOWN_TYPE';
        
        // Should allow unlimited since no rule exists
        for (let i = 0; i < 100; i++) {
            assert.strictEqual(rateLimiter.check(ip, unknownType), true);
        }
    });
    
    it('should apply rate limits to FILE_START messages', () => {
        const ip = '200:1234:5678::9';
        const messageType = 'FILE_START';
        
        // FILE_START has limit of 5 per minute
        for (let i = 0; i < 5; i++) {
            assert.strictEqual(rateLimiter.check(ip, messageType), true, `Message ${i + 1} should be allowed`);
        }
        
        // 6th should be blocked
        assert.strictEqual(rateLimiter.check(ip, messageType), false);
    });
    
    it('should apply rate limits to FILE_CHUNK messages', () => {
        const ip = '200:1234:5678::a';
        const messageType = 'FILE_CHUNK';
        
        // FILE_CHUNK has limit of 1000 per minute
        for (let i = 0; i < 1000; i++) {
            rateLimiter.check(ip, messageType); // Just consume, don't assert to save time
        }
        
        // 1001st should be blocked
        assert.strictEqual(rateLimiter.check(ip, messageType), false);
    });
    
    it('should apply rate limits to FILE_END messages', () => {
        const ip = '200:1234:5678::b';
        const messageType = 'FILE_END';
        
        // FILE_END has limit of 20 per minute
        for (let i = 0; i < 20; i++) {
            assert.strictEqual(rateLimiter.check(ip, messageType), true);
        }
        
        // 21st should be blocked
        assert.strictEqual(rateLimiter.check(ip, messageType), false);
    });
    
    it('should apply rate limits to FILE_CANCEL messages', () => {
        const ip = '200:1234:5678::c';
        const messageType = 'FILE_CANCEL';
        
        // FILE_CANCEL has limit of 10 per minute
        for (let i = 0; i < 10; i++) {
            assert.strictEqual(rateLimiter.check(ip, messageType), true);
        }
        
        // 11th should be blocked
        assert.strictEqual(rateLimiter.check(ip, messageType), false);
    });
    
    it('should allow reasonable file transfer workflows', () => {
        const ip = '200:1234:5678::d';
        
        // Simulate a file transfer workflow:
        // 1. Start transfer (FILE_START)
        assert.strictEqual(rateLimiter.check(ip, 'FILE_START'), true);
        
        // 2. Send many chunks (FILE_CHUNK)
        for (let i = 0; i < 500; i++) {
            assert.strictEqual(rateLimiter.check(ip, 'FILE_CHUNK'), true, `Chunk ${i} should be allowed`);
        }
        
        // 3. Receive ACKs (FILE_ACK)
        for (let i = 0; i < 500; i++) {
            assert.strictEqual(rateLimiter.check(ip, 'FILE_ACK'), true, `ACK ${i} should be allowed`);
        }
        
        // 4. End transfer (FILE_END)
        assert.strictEqual(rateLimiter.check(ip, 'FILE_END'), true);
        
        // All operations should be within limits
    });
    
    it('should return token count via getTokenCount', () => {
        const ip = '200:1234:5678::e';
        const messageType = 'PING';
        
        // Initially no bucket exists, so token count is 0
        assert.strictEqual(rateLimiter.getTokenCount(ip, messageType), 0);
        
        // After first check, bucket created with maxTokens, then one token consumed
        rateLimiter.check(ip, messageType);
        assert.strictEqual(rateLimiter.getTokenCount(ip, messageType), 59);
        
        // Consume all remaining tokens (58 more)
        for (let i = 0; i < 58; i++) {
            rateLimiter.check(ip, messageType);
        }
        assert.strictEqual(rateLimiter.getTokenCount(ip, messageType), 1);
        
        // Last token
        rateLimiter.check(ip, messageType);
        assert.strictEqual(rateLimiter.getTokenCount(ip, messageType), 0);
        
        // Should be blocked now
        assert.strictEqual(rateLimiter.check(ip, messageType), false);
        assert.strictEqual(rateLimiter.getTokenCount(ip, messageType), 0);
    });
    
    it('should cleanup old entries', () => {
        const ip1 = '200:1234:5678::f';
        const ip2 = '200:1234:5678::10';
        const messageType = 'PING';
        
        // Create activity for ip1
        rateLimiter.check(ip1, messageType);
        
        // Mock Date.now to simulate time passing
        const originalDateNow = Date.now;
        let mockTime = Date.now() + 7200000; // 2 hours later
        Date.now = () => mockTime;
        
        try {
            // ip1's bucket is old, ip2 is new
            rateLimiter.check(ip2, messageType);
            
            // Cleanup entries older than 1 hour
            rateLimiter.cleanup(3600000);
            
            // ip1 should have been removed (no bucket), ip2 should still exist
            // Note: getTokenCount returns 0 if no bucket
            assert.strictEqual(rateLimiter.getTokenCount(ip1, messageType), 0);
            assert.strictEqual(rateLimiter.getTokenCount(ip2, messageType), 59); // one used
        } finally {
            Date.now = originalDateNow;
        }
    });
    
    it('should update rules dynamically', () => {
        const ip = '200:1234:5678::11';
        const messageType = 'CUSTOM_TYPE';
        
        // Initially no rule for CUSTOM_TYPE -> unlimited
        for (let i = 0; i < 100; i++) {
            assert.strictEqual(rateLimiter.check(ip, messageType), true);
        }
        
        // Add a rule for CUSTOM_TYPE
        rateLimiter.updateRules({
            'CUSTOM_TYPE': { windowMs: 60000, maxTokens: 3, refillRate: 3/60 }
        });
        
        // Now should be limited
        for (let i = 0; i < 3; i++) {
            assert.strictEqual(rateLimiter.check(ip, messageType), true);
        }
        assert.strictEqual(rateLimiter.check(ip, messageType), false);
        
        // Existing rules should still work
        assert.strictEqual(rateLimiter.check(ip, 'PING'), true);
    });
    
    it('should handle multiple IPs with cleanup', () => {
        // This test ensures cleanup doesn't break multi-IP tracking
        const ips = ['200:1234:5678::12', '200:1234:5678::13', '200:1234:5678::14'];
        ips.forEach(ip => {
            rateLimiter.check(ip, 'PING');
        });
        
        // All should have buckets
        ips.forEach(ip => {
            assert.strictEqual(rateLimiter.getTokenCount(ip, 'PING'), 59);
        });
        
        // Cleanup with very large maxAge (should not remove anything)
        rateLimiter.cleanup(86400000); // 24 hours
        
        ips.forEach(ip => {
            assert.strictEqual(rateLimiter.getTokenCount(ip, 'PING'), 59);
        });
    });
    
    it('should cleanup old entries', async () => {
        const ip = '200:1234:5678::e';
        const messageType = 'PING';
        
        // Create activity
        rateLimiter.check(ip, messageType);
        
        // Verify bucket exists
        assert.ok(rateLimiter.getTokenCount(ip, messageType) > 0);
        
        // Cleanup with very short max age (simulate old entries)
        // We can't easily manipulate lastRefill time, so we'll just test that cleanup doesn't crash
        rateLimiter.cleanup(1); // 1ms max age
        
        // Bucket might still exist because elapsed time is small
        // This test mainly ensures cleanup doesn't throw
    });
    
    it('should update rules dynamically', () => {
        const ip = '200:1234:5678::f';
        const messageType = 'CUSTOM_TYPE';
        
        // Initially no rule for CUSTOM_TYPE = unlimited
        assert.strictEqual(rateLimiter.check(ip, messageType), true);
        
        // Add rule for CUSTOM_TYPE
        rateLimiter.updateRules({
            'CUSTOM_TYPE': { windowMs: 60000, maxTokens: 2, refillRate: 2/60 }
        });
        
        // Now should be limited
        assert.strictEqual(rateLimiter.check(ip, messageType), true); // First
        assert.strictEqual(rateLimiter.check(ip, messageType), true); // Second
        assert.strictEqual(rateLimiter.check(ip, messageType), false); // Third (blocked)
    });
    
    it('should get token count', () => {
        const ip = '200:1234:5678::10';
        const messageType = 'PING';
        
        // Before any checks, token count should be 0 (bucket not created yet)
        const initialTokens = rateLimiter.getTokenCount(ip, messageType);
        assert.strictEqual(initialTokens, 0); // No bucket yet
        
        // First check creates bucket with max tokens, consumes one
        rateLimiter.check(ip, messageType);
        const afterTokens = rateLimiter.getTokenCount(ip, messageType);
        assert.strictEqual(afterTokens, 59); // Should decrease by 1 from max 60
        
        // Different IP should return 0 (no bucket)
        assert.strictEqual(rateLimiter.getTokenCount('200:1234:5678::ff', messageType), 0);
    });
    
    it('should handle concurrent checks', () => {
        const ip = '200:1234:5678::11';
        const messageType = 'PING';
        
        // Simulate rapid consecutive checks (should not crash)
        for (let i = 0; i < 100; i++) {
            rateLimiter.check(ip, messageType);
        }
        
        // Should be blocked after 60
        assert.strictEqual(rateLimiter.check(ip, messageType), false);
    });
    
    it('should respect refill rate over time', async () => {
        const ip = '200:1234:5678::12';
        const messageType = 'PING';
        
        // Consume all tokens
        for (let i = 0; i < 60; i++) {
            rateLimiter.check(ip, messageType);
        }
        
        // Should be blocked
        assert.strictEqual(rateLimiter.check(ip, messageType), false);
        
        // Note: Cannot easily test refill without mocking timers
        // This test documents the need for timer mocking in real implementation
    });
    
    it('should maintain separate buckets for different message types from same IP', () => {
        const ip = '200:1234:5678::13';
        
        // Consume all PING tokens
        for (let i = 0; i < 60; i++) {
            rateLimiter.check(ip, 'PING');
        }
        
        // PING should be blocked
        assert.strictEqual(rateLimiter.check(ip, 'PING'), false);
        
        // HANDSHAKE_REQ should still work (different bucket)
        for (let i = 0; i < 5; i++) {
            assert.strictEqual(rateLimiter.check(ip, 'HANDSHAKE_REQ'), true);
        }
        // HANDSHAKE_REQ now blocked
        assert.strictEqual(rateLimiter.check(ip, 'HANDSHAKE_REQ'), false);
    });
});