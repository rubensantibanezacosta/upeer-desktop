import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateDhtSequence, MAX_DHT_SEQ_JUMP, canonicalStringify } from '../src/main_process/network/utils.js';

describe('Security Utils', () => {
    describe('validateDhtSequence', () => {
        it('should accept valid sequence jumps', () => {
            const result1 = validateDhtSequence(100, 101);
            assert.strictEqual(result1.valid, true);
            assert.strictEqual(result1.requiresPoW, false);
            
            const result2 = validateDhtSequence(100, 1100); // Jump of 1000 (max allowed)
            assert.strictEqual(result2.valid, true);
            assert.strictEqual(result2.requiresPoW, false);
        });
        
        it('should reject non-increasing sequences', () => {
            // Same sequence
            const result1 = validateDhtSequence(100, 100);
            assert.strictEqual(result1.valid, false);
            assert.strictEqual(result1.requiresPoW, false);
            assert.ok(result1.reason?.includes('not increasing'));
            
            // Lower sequence
            const result2 = validateDhtSequence(100, 99);
            assert.strictEqual(result2.valid, false);
            assert.strictEqual(result2.requiresPoW, false);
        });
        
        it('should flag large jumps as requiring PoW', () => {
            // Jump of MAX_DHT_SEQ_JUMP + 1
            const result = validateDhtSequence(100, 100 + MAX_DHT_SEQ_JUMP + 1);
            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.requiresPoW, true);
            assert.ok(result.reason?.includes('too large'));
        });
        
        it('should handle edge cases', () => {
            // From zero
            const result1 = validateDhtSequence(0, 1);
            assert.strictEqual(result1.valid, true);
            
            // Very large jump
            const result2 = validateDhtSequence(1, 1000000);
            assert.strictEqual(result2.valid, false);
            assert.strictEqual(result2.requiresPoW, true);
        });
    });
    
    describe('canonicalStringify', () => {
        it('should serialize objects with keys in consistent order', () => {
            const obj1 = { b: 2, a: 1, c: 3 };
            const obj2 = { c: 3, b: 2, a: 1 };
            const obj3 = { a: 1, b: 2, c: 3 };
            
            const str1 = canonicalStringify(obj1);
            const str2 = canonicalStringify(obj2);
            const str3 = canonicalStringify(obj3);
            
            // All should produce same string regardless of key order
            assert.strictEqual(str1, str2);
            assert.strictEqual(str2, str3);
            
            // Should be sorted alphabetically
            assert.strictEqual(str1, '{"a":1,"b":2,"c":3}');
        });
        
        it('should handle nested objects', () => {
            const obj = {
                z: { y: 2, x: 1 },
                a: { c: 2, b: 1 }
            };
            
            const result = canonicalStringify(obj);
            // Outer keys should be sorted: a first, then z
            assert.ok(result.startsWith('{"a":'));
        });
        
        it('should handle arrays', () => {
            const obj = { b: [3, 1, 2], a: 'test' };
            const result = canonicalStringify(obj);
            // Arrays should maintain their order
            assert.ok(result.includes('[3,1,2]'));
        });
        
        it('should produce consistent output for signatures', () => {
            // This is critical for signature verification
            const message1 = {
                type: 'CHAT',
                id: '123',
                content: 'Hello',
                timestamp: 1234567890
            };
            
            const message2 = {
                timestamp: 1234567890,
                content: 'Hello',
                id: '123',
                type: 'CHAT'
            };
            
            const str1 = canonicalStringify(message1);
            const str2 = canonicalStringify(message2);
            
            assert.strictEqual(str1, str2);
        });
    });
    
    describe('MAX_DHT_SEQ_JUMP constant', () => {
        it('should have a reasonable value', () => {
            assert.strictEqual(typeof MAX_DHT_SEQ_JUMP, 'number');
            assert.ok(MAX_DHT_SEQ_JUMP > 0);
            assert.ok(MAX_DHT_SEQ_JUMP < 1000000); // Sanity check
        });
    });
});