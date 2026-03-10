import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateMessage } from '../src/main_process/security/validation.js';

describe('Security Validation', () => {
    it('should validate HANDSHAKE_REQ correctly', () => {
        const validData = {
            publicKey: 'a'.repeat(64), // 64 hex chars
            ephemeralPublicKey: 'b'.repeat(64),
            alias: 'Test User',
            powProof: 'abc123'
        };

        const result = validateMessage('HANDSHAKE_REQ', validData);
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.error, undefined);

        // Test missing publicKey
        const invalid1 = { ...validData, publicKey: undefined };
        const result1 = validateMessage('HANDSHAKE_REQ', invalid1);
        assert.strictEqual(result1.valid, false);
        assert.strictEqual(result1.error?.includes('publicKey'), true);

        // Test invalid publicKey length
        const invalid2 = { ...validData, publicKey: 'short' };
        const result2 = validateMessage('HANDSHAKE_REQ', invalid2);
        assert.strictEqual(result2.valid, false);

        // Test alias too long
        const invalid3 = { ...validData, alias: 'a'.repeat(101) };
        const result3 = validateMessage('HANDSHAKE_REQ', invalid3);
        assert.strictEqual(result3.valid, false);
    });

    it('should validate CHAT messages correctly', () => {
        const validData = {
            id: '123e4567-e89b-12d3-a456-426614174000',
            content: 'Hello World',
            nonce: 'a'.repeat(48),
            ephemeralPublicKey: 'b'.repeat(64),
            replyTo: '123e4567-e89b-12d3-a456-426614174001',
            useRecipientEphemeral: false
        };

        const result = validateMessage('CHAT', validData);
        assert.strictEqual(result.valid, true);

        // Test missing id
        const invalid1 = { ...validData, id: undefined };
        const result1 = validateMessage('CHAT', invalid1);
        assert.strictEqual(result1.valid, false);

        // Test content too long
        const invalid2 = { ...validData, content: 'a'.repeat(10001) };
        const result2 = validateMessage('CHAT', invalid2);
        assert.strictEqual(result2.valid, false);

        // Test invalid nonce length
        const invalid3 = { ...validData, nonce: 'short' };
        const result3 = validateMessage('CHAT', invalid3);
        assert.strictEqual(result3.valid, false);
    });

    it('should validate DHT_UPDATE correctly', () => {
        const validData = {
            locationBlock: {
                address: '200:1234:5678::1',
                dhtSeq: 100,
                signature: 'a'.repeat(128) // 128 hex chars
            }
        };

        const result = validateMessage('DHT_UPDATE', validData);
        assert.strictEqual(result.valid, true);

        // Test missing locationBlock
        const invalid1 = { locationBlock: undefined };
        const result1 = validateMessage('DHT_UPDATE', invalid1);
        assert.strictEqual(result1.valid, false);

        // Test invalid dhtSeq
        const invalid2 = {
            locationBlock: {
                address: '200:1234:5678::1',
                dhtSeq: -1,
                signature: 'a'.repeat(128)
            }
        };
        const result2 = validateMessage('DHT_UPDATE', invalid2);
        assert.strictEqual(result2.valid, false);

        // Test invalid signature length
        const invalid3 = {
            locationBlock: {
                address: '200:1234:5678::1',
                dhtSeq: 100,
                signature: 'short'
            }
        };
        const result3 = validateMessage('DHT_UPDATE', invalid3);
        assert.strictEqual(result3.valid, false);
    });

    it('should validate DHT_QUERY correctly', () => {
        const validData = {
            targetId: 'a'.repeat(32) // 32 hex chars for upeer ID
        };

        const result = validateMessage('DHT_QUERY', validData);
        assert.strictEqual(result.valid, true);

        // Test invalid targetId length
        const invalid1 = { targetId: 'short' };
        const result1 = validateMessage('DHT_QUERY', invalid1);
        assert.strictEqual(result1.valid, false);
    });

    it('should validate CHAT_REACTION correctly', () => {
        const validData = {
            msgId: '123e4567-e89b-12d3-a456-426614174000',
            emoji: '👍',
            remove: false
        };

        const result = validateMessage('CHAT_REACTION', validData);
        assert.strictEqual(result.valid, true);

        // Test missing emoji
        const invalid1 = { ...validData, emoji: undefined };
        const result1 = validateMessage('CHAT_REACTION', invalid1);
        assert.strictEqual(result1.valid, false);

        // Test emoji too long
        const invalid2 = { ...validData, emoji: 'a'.repeat(11) };
        const result2 = validateMessage('CHAT_REACTION', invalid2);
        assert.strictEqual(result2.valid, false);
    });

    it('should reject unknown message types', () => {
        const result = validateMessage('UNKNOWN_TYPE', {});
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.error?.includes('Unknown message type'), true);
    });

    it('should validate DHT_EXCHANGE peer limits', () => {
        const validData = {
            peers: Array(50).fill(0).map((_, i) => ({
                upeerId: 'a'.repeat(32),
                publicKey: 'b'.repeat(64),
                locationBlock: {
                    address: '200:1234:5678::1',
                    dhtSeq: i,
                    signature: 'c'.repeat(128)
                }
            }))
        };

        const result = validateMessage('DHT_EXCHANGE', validData);
        assert.strictEqual(result.valid, true);

        // Test too many peers
        const invalidData = {
            peers: Array(51).fill(0).map((_, i) => ({
                upeerId: 'a'.repeat(32),
                publicKey: 'b'.repeat(64)
            }))
        };

        const result2 = validateMessage('DHT_EXCHANGE', invalidData);
        assert.strictEqual(result2.valid, false);
        assert.strictEqual(result2.error?.includes('Too many peers'), true);
    });
});