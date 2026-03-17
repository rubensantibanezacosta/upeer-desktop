import { describe, it, expect } from 'vitest';
import { validateHandshakeReq, validateHandshakeAccept, validateChat } from '../../../src/main_process/security/validation.js';

describe('Security Validation', () => {
    describe('validateHandshakeReq', () => {
        it('should validate correctly with valid data', () => {
            const validData = {
                publicKey: 'a'.repeat(64),
                ephemeralPublicKey: 'b'.repeat(64),
                alias: 'test-user'
            };
            const result = validateHandshakeReq(validData);
            expect(result.valid).toBe(true);
        });

        it('should fail if publicKey is invalid', () => {
            const data = { publicKey: 'short' };
            const result = validateHandshakeReq(data);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Invalid publicKey');
        });

        it('should fail if avatar is too large', () => {
            const data = {
                publicKey: 'a'.repeat(64),
                avatar: 'a'.repeat(400000) // > 307200
            };
            const result = validateHandshakeReq(data);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Avatar too large or invalid');
        });

        it('should accept Argon2id PoW format (JSON)', () => {
            const data = {
                publicKey: 'a'.repeat(64),
                powProof: '{"s":"123","t":123}'
            };
            const result = validateHandshakeReq(data);
            expect(result.valid).toBe(true);
        });

        it('should fail if powProof format is invalid', () => {
            const data = {
                publicKey: 'a'.repeat(64),
                powProof: 'invalid-proof-format-!@#'
            };
            const result = validateHandshakeReq(data);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Invalid powProof format');
        });
    });

    describe('validateChat', () => {
        it('should enforce ciphertext length limits for DR/Crypto messages', () => {
            const data = {
                id: 'msg-1',
                content: 'short', // Too short for ratchet/nonce
                nonce: 'a'.repeat(48)
            };
            const result = validateChat(data);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Ciphertext too short (min 32 hex chars)');
        });

        it('should fail if content is too long', () => {
            const data = {
                id: 'msg-1',
                content: 'a'.repeat(200001)
            };
            const result = validateChat(data);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Content too long');
        });

        it('should validate x3dhInit keys strictly', () => {
            const data = {
                id: 'msg-1',
                content: 'a'.repeat(32),
                x3dhInit: {
                    ikPub: 'too-short',
                    ekPub: 'b'.repeat(64),
                    spkId: 1
                }
            };
            const result = validateChat(data);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Invalid x3dhInit.ikPub');
        });
    });
});
