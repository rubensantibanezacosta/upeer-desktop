import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    computeKeyFingerprint,
    updateContactPublicKey,
    updateContactEphemeralPublicKey,
    updateContactSignedPreKey
} from '../../../src/main_process/storage/contacts/keys.js';
import * as shared from '../../../src/main_process/storage/shared.js';

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
    getSchema: vi.fn(),
    eq: vi.fn((a, b) => ({ field: a, value: b }))
}));

describe('Contacts Storage Keys', () => {
    let mockDb: any;
    let mockSchema: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockDb = {
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            get: vi.fn(),
            update: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            run: vi.fn()
        };
        mockSchema = {
            contacts: {
                upeerId: 'upeerId',
                publicKey: 'publicKey',
                ephemeralPublicKey: 'ephemeralPublicKey',
                ephemeralPublicKeyUpdatedAt: 'ephemeralPublicKeyUpdatedAt',
                signedPreKey: 'signedPreKey',
                signedPreKeySignature: 'signedPreKeySignature',
                signedPreKeyId: 'signedPreKeyId',
                status: 'status'
            }
        };
        (shared.getDb as any).mockReturnValue(mockDb);
        (shared.getSchema as any).mockReturnValue(mockSchema);
    });

    describe('computeKeyFingerprint', () => {
        it('should compute and format fingerprint correctly', () => {
            const pubKey = '0'.repeat(64);
            const fingerprint = computeKeyFingerprint(pubKey);
            // BLAKE2b(0...0) short = 16 bytes = 32 hex = 8 groups of 4
            expect(fingerprint).toMatch(/^([0-9A-F]{4} ){7}[0-9A-F]{4}$/);
        });
    });

    describe('updateContactPublicKey', () => {
        it('should return changed=false if same key', () => {
            const upeerId = 'peer1';
            const key = 'a'.repeat(64);
            mockDb.get.mockReturnValue({ publicKey: key });

            const result = updateContactPublicKey(upeerId, key);
            expect(result.changed).toBe(false);
            expect(result.newKey).toBe(key);
            expect(mockDb.update).toHaveBeenCalled();
        });

        it('should return changed=true if key is different (TOFU)', () => {
            const upeerId = 'peer1';
            const oldKey = 'a'.repeat(64);
            const newKey = 'b'.repeat(64);
            mockDb.get.mockReturnValue({ publicKey: oldKey });

            const result = updateContactPublicKey(upeerId, newKey);
            expect(result.changed).toBe(true);
            expect(result.oldKey).toBe(oldKey);
            expect(result.newKey).toBe(newKey);
        });

        it('should handle new contact (no oldKey)', () => {
            const upeerId = 'peer1';
            const newKey = 'b'.repeat(64);
            mockDb.get.mockReturnValue(undefined);

            const result = updateContactPublicKey(upeerId, newKey);
            expect(result.changed).toBe(false);
            expect(result.oldKey).toBeUndefined();
        });
    });

    describe('updateContactEphemeralPublicKey', () => {
        it('should update ephemeral key and timestamp', () => {
            updateContactEphemeralPublicKey('peer1', 'ek');
            expect(mockDb.update).toHaveBeenCalledWith(mockSchema.contacts);
            expect(mockDb.set).toHaveBeenCalledWith(expect.objectContaining({
                ephemeralPublicKey: 'ek',
                ephemeralPublicKeyUpdatedAt: expect.any(String)
            }));
            expect(mockDb.run).toHaveBeenCalled();
        });
    });

    describe('updateContactSignedPreKey', () => {
        it('should update all SPK fields', () => {
            updateContactSignedPreKey('peer1', 'spkPub', 'spkSig', 123);
            expect(mockDb.set).toHaveBeenCalledWith({
                signedPreKey: 'spkPub',
                signedPreKeySignature: 'spkSig',
                signedPreKeyId: 123
            });
            expect(mockDb.run).toHaveBeenCalled();
        });
    });
});
