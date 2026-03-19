import { describe, it, expect } from 'vitest';
import { AdaptivePow } from '../../../src/main_process/security/pow.js';
import sodium from 'sodium-native';
import crypto from 'node:crypto';

describe('Adaptive Proof-of-Work (PoW) - Unit Tests', () => {
    const testUpeerId = 'test-upeer-id-' + 'a'.repeat(32);

    describe('Argon2id PoW (Modern Format)', () => {
        it('should generate and verify a valid Argon2id proof', () => {
            const proof = AdaptivePow.generateLightProof(testUpeerId);
            expect(proof).toContain('{"s":');
            expect(proof).toContain('"t":');

            const isValid = AdaptivePow.verifyLightProof(proof, testUpeerId);
            expect(isValid).toBe(true);
        });

        it('should reject a proof for a different upeerId', () => {
            const proof = AdaptivePow.generateLightProof(testUpeerId);
            const isValid = AdaptivePow.verifyLightProof(proof, 'wrong-upeer-id');
            expect(isValid).toBe(false);
        });

        it('should reject an expired proof', () => {
            // Un proof de hace 10 minutos (límite 5 min)
            const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
            const proof = JSON.stringify({ s: 'a'.repeat(sodium.crypto_pwhash_SALTBYTES * 2), t: oldTimestamp });

            const isValid = AdaptivePow.verifyLightProof(proof, testUpeerId);
            expect(isValid).toBe(false);
        });

        it('should reject malformed JSON proof', () => {
            const malformed = '{"s": "invalid"}'; // falta campo 't' o formato incorrecto
            expect(AdaptivePow.verifyLightProof(malformed, testUpeerId)).toBe(false);

            const notJson = '{not-json';
            expect(AdaptivePow.verifyLightProof(notJson, testUpeerId)).toBe(false);
        });
    });

    describe('SHA-256 PoW (Legacy Format)', () => {
        it('should verify a valid legacy SHA-256 proof', () => {
            // Encontrar un nonce manual para el test (primer caracter del hash SHA256 sea '0')
            let nonceValue = 0;
            let foundValid = false;
            while (!foundValid && nonceValue < 1000) {
                const h = crypto.createHash('sha256').update(testUpeerId + nonceValue.toString()).digest('hex');
                if (h.startsWith('0')) {
                    foundValid = true;
                } else {
                    nonceValue++;
                }
            }

            const result = AdaptivePow.verifyLightProof(nonceValue.toString(), testUpeerId);
            expect(result).toBe(true);
        });

        it('should reject invalid legacy proof', () => {
            // Muy difícil que 'invalid-nonce' justo produzca un hash que empiece por '0'
            const result = AdaptivePow.verifyLightProof('not-a-valid-nonce-ever-123', testUpeerId);
            // Si por casualidad diera '0' (1/16 prob), este test fallaría, pero es improbable
            expect(result).toBe(false);
        });
    });

    it('should return false for empty or non-string proofs', () => {
        expect(AdaptivePow.verifyLightProof('', testUpeerId)).toBe(false);
        expect(AdaptivePow.verifyLightProof(null as any, testUpeerId)).toBe(false);
    });
});
