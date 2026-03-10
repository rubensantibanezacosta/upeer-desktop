import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { AdaptivePow } from '../src/main_process/security/pow.js';

describe('Adaptive Proof-of-Work', () => {
    it('should generate and verify PoW challenge', () => {
        const upeerId = 'test1234567890abcdef1234567890abcd';
        const challenge = AdaptivePow.generateChallenge(upeerId);
        
        assert.strictEqual(typeof challenge.difficulty, 'number');
        assert.strictEqual(typeof challenge.timestamp, 'number');
        assert.strictEqual(challenge.data, upeerId);
        
        // Difficulty should be within bounds
        assert.ok(challenge.difficulty >= AdaptivePow.DIFFICULTY_LOW);
        assert.ok(challenge.difficulty <= AdaptivePow.DIFFICULTY_HIGH);
    });
    
    it('should solve and verify PoW challenge', () => {
        const upeerId = 'test1234567890abcdef1234567890abcd';
        const challenge = {
            difficulty: AdaptivePow.DIFFICULTY_LOW, // Use low difficulty for faster tests
            timestamp: Date.now(),
            data: upeerId
        };
        
        const solution = AdaptivePow.solveChallenge(challenge);
        
        // With low difficulty, should find solution
        assert.ok(solution !== null);
        if (solution) {
            assert.strictEqual(typeof solution.nonce, 'string');
            assert.strictEqual(solution.difficulty, challenge.difficulty);
            assert.strictEqual(solution.timestamp, challenge.timestamp);
            
            // Should verify correctly
            const isValid = AdaptivePow.verifySolution(solution, upeerId);
            assert.strictEqual(isValid, true);
        }
    });
    
    it('should reject expired challenges', () => {
        const upeerId = 'test1234567890abcdef1234567890abcd';
        const solution = {
            nonce: '123',
            difficulty: AdaptivePow.DIFFICULTY_LOW,
            timestamp: Date.now() - (AdaptivePow.CHALLENGE_VALIDITY + 1000) // Expired
        };
        
        const isValid = AdaptivePow.verifySolution(solution, upeerId);
        assert.strictEqual(isValid, false);
    });
    
    it('should reject solutions with insufficient difficulty', () => {
        const upeerId = 'test1234567890abcdef1234567890abcd';
        const solution = {
            nonce: '123',
            difficulty: AdaptivePow.DIFFICULTY_LOW - 1, // Too low
            timestamp: Date.now()
        };
        
        const isValid = AdaptivePow.verifySolution(solution, upeerId);
        assert.strictEqual(isValid, false);
    });
    
    it('should adjust difficulty based on device type and reputation', () => {
        // Test mobile with low reputation
        const mobileLowRep = AdaptivePow.adjustDifficulty('mobile', 0.1);
        assert.ok(mobileLowRep >= AdaptivePow.DIFFICULTY_LOW);
        assert.ok(mobileLowRep <= AdaptivePow.DIFFICULTY_HIGH);
        
        // Test mobile with high reputation
        const mobileHighRep = AdaptivePow.adjustDifficulty('mobile', 0.9);
        assert.ok(mobileHighRep >= AdaptivePow.DIFFICULTY_LOW);
        assert.ok(mobileHighRep <= AdaptivePow.DIFFICULTY_HIGH);
        
        // High reputation should have lower difficulty
        assert.ok(mobileHighRep <= mobileLowRep);
        
        // Test desktop
        const desktop = AdaptivePow.adjustDifficulty('desktop', 0.5);
        assert.ok(desktop >= AdaptivePow.DIFFICULTY_LOW);
        assert.ok(desktop <= AdaptivePow.DIFFICULTY_HIGH);
        
        // Test server
        const server = AdaptivePow.adjustDifficulty('server', 0.5);
        assert.ok(server >= AdaptivePow.DIFFICULTY_LOW);
        assert.ok(server <= AdaptivePow.DIFFICULTY_HIGH);
        
        // Server should have higher difficulty than desktop
        assert.ok(server >= desktop);
    });
    
    it('should generate and verify light proofs', () => {
        const upeerId = 'test1234567890abcdef1234567890abcd';
        
        // Generate light proof
        const proof = AdaptivePow.generateLightProof(upeerId);
        assert.strictEqual(typeof proof, 'string');
        // Proof can be shorter than 8 chars if it's a timestamp fallback
        assert.ok(proof.length > 0);
        assert.ok(proof.length <= 64);
        
        // Should verify
        const isValid = AdaptivePow.verifyLightProof(proof, upeerId);
        assert.strictEqual(isValid, true);
        
        // Invalid proofs should fail
        const invalidProofs = [
            '',
            'not-hex',
            'abc', // Too short
            'a'.repeat(65) // Too long
        ];
        
        for (const invalidProof of invalidProofs) {
            const result = AdaptivePow.verifyLightProof(invalidProof, upeerId);
            assert.strictEqual(result, false);
        }
    });
    
    it('should solve challenge with custom difficulty', () => {
        const upeerId = 'test1234567890abcdef1234567890abcd';
        const challenge = AdaptivePow.generateChallenge(upeerId, AdaptivePow.DIFFICULTY_LOW);
        
        assert.strictEqual(challenge.difficulty, AdaptivePow.DIFFICULTY_LOW);
        
        const solution = AdaptivePow.solveChallenge(challenge);
        assert.ok(solution !== null);
    });
    
    it('should handle null solution when challenge is too hard', () => {
        const upeerId = 'test1234567890abcdef1234567890abcd';
        // Create an impossible challenge (very high difficulty)
        const challenge = {
            difficulty: 255, // Essentially impossible
            timestamp: Date.now(),
            data: upeerId
        };
        
        const solution = AdaptivePow.solveChallenge(challenge);
        // Should return null since it can't solve within maxAttempts
        assert.strictEqual(solution, null);
    });
});