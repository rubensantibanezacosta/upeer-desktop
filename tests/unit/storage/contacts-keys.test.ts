import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    computeKeyFingerprint,
    updateContactPublicKey,
    updateContactEphemeralPublicKey,
    updateContactDeviceIdentity,
    updateContactSignedPreKey
} from '../../../src/main_process/storage/contacts/keys.js';
import * as shared from '../../../src/main_process/storage/shared.js';

type MockDb = {
    select: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
};
type MockSchema = {
    contacts: {
        upeerId: string;
        publicKey: string;
        ephemeralPublicKey: string;
        ephemeralPublicKeyUpdatedAt: string;
        signedPreKey: string;
        signedPreKeySignature: string;
        signedPreKeyId: string;
        status: string;
        deviceId: string;
    };
    ratchetSessions: {
        upeerId: string;
    };
};

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
    getSchema: vi.fn(),
    eq: vi.fn((a, b) => ({ field: a, value: b }))
}));

describe('Contacts Storage Keys', () => {
    let mockDb: MockDb;
    let mockSchema: MockSchema;

    beforeEach(() => {
        vi.clearAllMocks();
        mockDb = {
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            get: vi.fn(),
            update: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
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
                status: 'status',
                deviceId: 'deviceId'
            },
            ratchetSessions: {
                upeerId: 'upeerId'
            }
        };
        vi.mocked(shared.getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof shared.getDb>);
        vi.mocked(shared.getSchema).mockReturnValue(mockSchema as unknown as ReturnType<typeof shared.getSchema>);
    });

    describe('computeKeyFingerprint', () => {
        it('should compute and format fingerprint correctly', () => {
            const pubKey = '0'.repeat(64);
            const fingerprint = computeKeyFingerprint(pubKey);
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

    describe('updateContactDeviceIdentity', () => {
        const identity = {
            devicePublicKey: 'a'.repeat(64),
            deviceId: 'b'.repeat(64),
            deviceCertificate: '{"version":1}',
            deviceSignedPreKey: 'c'.repeat(64),
            deviceSignedPreKeySignature: 'd'.repeat(128),
            deviceSignedPreKeyId: 456
        };

        it('invalida las sesiones cuando cambia el dispositivo', () => {
            mockDb.get.mockReturnValue({ deviceId: 'e'.repeat(64) });

            const result = updateContactDeviceIdentity('peer1', identity);

            expect(result.changed).toBe(true);
            expect(result.previousDeviceId).toBe('e'.repeat(64));
            expect(mockDb.delete).toHaveBeenCalledWith(mockSchema.ratchetSessions);
            expect(mockDb.run).toHaveBeenCalled();
        });

        it('conserva las sesiones cuando el dispositivo no cambia', () => {
            mockDb.get.mockReturnValue({ deviceId: identity.deviceId });

            const result = updateContactDeviceIdentity('peer1', identity);

            expect(result.changed).toBe(false);
            expect(mockDb.delete).not.toHaveBeenCalled();
        });
    });
});
