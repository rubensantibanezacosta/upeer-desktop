import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleHandshakeReq, handleHandshakeAccept } from '../../../src/main_process/network/handlers/contacts.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations';
import * as contactsKeys from '../../../src/main_process/storage/contacts/keys';
import * as identity from '../../../src/main_process/security/identity';
import * as pow from '../../../src/main_process/security/pow';
import * as reputation from '../../../src/main_process/security/reputation/vouches';
import * as pendingOutbox from '../../../src/main_process/storage/pending-outbox';

// Mock de dependencias
vi.mock('../../../src/main_process/network/handlers/sync', () => ({
    broadcastPulse: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/keys', () => ({
    computeKeyFingerprint: vi.fn((pk) => "fingerprint-" + pk),
    updateContactSignedPreKey: vi.fn(),
    updateContactPublicKey: vi.fn(),
    updateContactEphemeralPublicKey: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/operations', () => ({
    getContactByUpeerId: vi.fn(),
    addOrUpdateContact: vi.fn(),
    isContactBlocked: vi.fn(() => false),
    getContactByAddress: vi.fn(),
    updateContactName: vi.fn(),
    updateContactAvatar: vi.fn(),
    deleteContact: vi.fn(),
    getContacts: vi.fn(() => []),
}));

vi.mock('../../../src/main_process/storage/pending-outbox', () => ({
    flushPendingOutbox: vi.fn(async () => { }),
}));

vi.mock('../../../src/main_process/storage/shared', () => ({
    runTransaction: vi.fn((fn) => fn()),
    getDb: vi.fn(),
    getSchema: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity', () => ({
    verify: vi.fn(() => true),
    getUPeerIdFromPublicKey: vi.fn((pk) => "peer-" + pk.toString('hex').slice(0, 8)),
}));

vi.mock('../../../src/main_process/security/pow', () => ({
    AdaptivePow: {
        verifyLightProof: vi.fn(() => true)
    }
}));

vi.mock('../../../src/main_process/security/reputation/vouches', () => ({
    issueVouch: vi.fn(async () => { }),
    computeScore: vi.fn(() => 100),
    VouchType: { HANDSHAKE: 'HANDSHAKE' }
}));

vi.mock('../../../src/main_process/security/identity-rate-limiter', () => {
    return {
        IdentityRateLimiter: class {
            checkIdentity() { return true; }
        }
    };
});

// Mock de Electron
const mockWin = {
    webContents: {
        send: vi.fn()
    }
} as any;

describe('Contact Handlers', () => {
    const rinfo = { address: '1.2.3.4', port: 12345 };
    const validPubKey = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
    const senderUpeerId = "peer-" + validPubKey.slice(0, 8);
    const senderYggAddress = 'ygg-addr';
    const mockSendResponse = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(identity, 'verify').mockReturnValue(true);
        vi.spyOn(identity, 'getUPeerIdFromPublicKey').mockImplementation((pk) => "peer-" + pk.toString('hex').slice(0, 8));
        vi.spyOn(pow.AdaptivePow, 'verifyLightProof').mockReturnValue(true);
        vi.spyOn(reputation, 'computeScore').mockReturnValue(100);
        (contactsOps.isContactBlocked as any).mockReturnValue(false);
    });

    describe('handleHandshakeReq', () => {
        it('should accept handshake from a new contact with valid PoW', async () => {
            const data = {
                publicKey: validPubKey,
                powProof: 'valid-proof',
                alias: 'Alice'
            };

            (contactsOps.getContactByUpeerId as any).mockResolvedValue(null);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(pow.AdaptivePow.verifyLightProof).toHaveBeenCalledWith('valid-proof', senderUpeerId);
            expect(contactsOps.addOrUpdateContact).toHaveBeenCalledWith(
                senderUpeerId,
                rinfo.address,
                'Alice',
                data.publicKey,
                'incoming',
                undefined,
                undefined,
                undefined,
                undefined,
                undefined
            );
        });

        it('should reject new contact without PoW', async () => {
            const data = { publicKey: validPubKey, alias: 'NoPOW' };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue(null);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
        });

        it('should handle re-handshake from already connected contact', async () => {
            const data = { publicKey: validPubKey, alias: 'Alice (updated)' };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({
                upeerId: senderUpeerId,
                status: 'connected',
                publicKey: validPubKey
            });

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.addOrUpdateContact).toHaveBeenCalledWith(
                senderUpeerId,
                rinfo.address,
                'Alice (updated)',
                data.publicKey,
                'connected',
                undefined,
                undefined,
                undefined,
                undefined,
                undefined
            );
        });

        it('should block handshake if contact is blocked', async () => {
            const data = { publicKey: validPubKey };
            (contactsOps.isContactBlocked as any).mockReturnValue(true);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
        });

        it('should block if signature verification fails in handleHandshakeReq', async () => {
            const data = { publicKey: validPubKey };
            (identity.verify as any).mockReturnValue(false);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
        });

        it('should fail if upeerId does not match public key in handleHandshakeReq', async () => {
            const data = { publicKey: validPubKey };
            await handleHandshakeReq(data, 'sig', 'mismatch-id', senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
        });

        it('should alert if reputation is too low (untrustworthy)', async () => {
            const data = { publicKey: validPubKey, alias: 'BadPeer', powProof: 'valid-proof' };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue(null);
            (reputation.computeScore as any).mockReturnValue(30);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(mockWin.webContents.send).toHaveBeenCalledWith('contact-untrustworthy', expect.objectContaining({
                upeerId: senderUpeerId
            }));
        });

        it('should alert on TOFU (key change) in handleHandshakeReq', async () => {
            const data = { publicKey: validPubKey, alias: 'Alice' };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({
                upeerId: senderUpeerId,
                status: 'connected',
                publicKey: 'another-key'
            });

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(mockWin.webContents.send).toHaveBeenCalledWith('key-change-alert', expect.objectContaining({
                upeerId: senderUpeerId
            }));
        });
    });

    describe('handleHandshakeAccept', () => {
        it('should upgrade pending contact to connected', async () => {
            const data = { publicKey: validPubKey, alias: 'Bob' };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({
                upeerId: senderUpeerId,
                status: 'pending',
                name: 'Bob Pending'
            });
            (contactsKeys.updateContactPublicKey as any).mockReturnValue({ changed: false });

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.addOrUpdateContact).toHaveBeenCalledWith(
                senderUpeerId,
                rinfo.address,
                'Bob',
                data.publicKey,
                'connected',
                undefined,
                undefined,
                undefined,
                undefined,
                expect.any(Array)
            );
        });

        it('should handle ghost pending contacts for the same address', async () => {
            const data = { publicKey: validPubKey, alias: 'Bob' };
            (contactsOps.getContactByAddress as any).mockResolvedValue({ upeerId: 'pending-ghost' });
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: senderUpeerId, status: 'pending' });
            (contactsKeys.updateContactPublicKey as any).mockReturnValue({ changed: false });

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.deleteContact).toHaveBeenCalledWith('pending-ghost');
        });

        it('should skip update if contact is not pending in handleHandshakeAccept', async () => {
            const data = { publicKey: validPubKey };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({
                upeerId: senderUpeerId,
                status: 'connected'
            });

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsKeys.updateContactPublicKey).not.toHaveBeenCalled();
        });

        it('should fail if signature verification fails in handleHandshakeAccept', async () => {
            const data = { publicKey: validPubKey };
            (identity.verify as any).mockReturnValue(false);

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
        });

        it('should fail on missing fields in handleHandshakeAccept', async () => {
            await handleHandshakeAccept({} as any, '', '', '', rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
        });

        it('should fail on rate limit in handleHandshakeAccept', async () => {
            const data = { publicKey: validPubKey, type: 'HANDSHAKE_ACCEPT' };
            const { IdentityRateLimiter } = await import('../../../src/main_process/security/identity-rate-limiter');
            const spy = vi.spyOn(IdentityRateLimiter.prototype, 'checkIdentity').mockReturnValueOnce(false);

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.getContactByAddress).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('should fail on rate limit in handleHandshakeReq', async () => {
            const data = { publicKey: validPubKey, powProof: 'valid', type: 'HANDSHAKE_REQ' };
            const { IdentityRateLimiter } = await import('../../../src/main_process/security/identity-rate-limiter');
            const spy = vi.spyOn(IdentityRateLimiter.prototype, 'checkIdentity').mockReturnValueOnce(false);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.getContactByUpeerId).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('should fail on upeerId mismatch in handleHandshakeAccept', async () => {
            const data = { publicKey: validPubKey };
            (identity.verify as any).mockReturnValue(true);
            await handleHandshakeAccept(data, 'sig', 'mismatch', senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
        });

        it('should handle legacy signature in handleHandshakeAccept', async () => {
            const data = { publicKey: validPubKey };
            (identity.verify as any)
                .mockReturnValueOnce(false) // Standard
                .mockReturnValueOnce(true);  // Legacy
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ status: 'pending' });

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.addOrUpdateContact).toHaveBeenCalled();
        });

        it('should handle even more legacy signature in handleHandshakeAccept', async () => {
            const data = { publicKey: validPubKey };
            (identity.verify as any)
                .mockReturnValueOnce(false) // Standard
                .mockReturnValueOnce(false) // Legacy
                .mockReturnValueOnce(true);  // Even more legacy
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ status: 'pending' });

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.addOrUpdateContact).toHaveBeenCalled();
        });

        it('should alert on key-change (TOFU) during handleHandshakeAccept', async () => {
            const data = { publicKey: validPubKey, avatar: 'data:image/png;base64,123', addresses: ['ipv6'] };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({
                upeerId: senderUpeerId,
                status: 'pending',
                publicKey: 'OLD-pubkey'
            });
            (contactsKeys.updateContactPublicKey as any).mockReturnValue({ changed: true, oldKey: 'OLD-pubkey', newKey: validPubKey });

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(mockWin.webContents.send).toHaveBeenCalledWith('key-change-alert', expect.objectContaining({
                upeerId: senderUpeerId
            }));
            expect(contactsOps.updateContactAvatar).toHaveBeenCalled();
        });

        it('should verify and update signed prekey in handleHandshakeAccept', async () => {
            const data = {
                publicKey: validPubKey,
                signedPreKey: { spkPub: 'pub', spkSig: 'sig', spkId: 1 }
            };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({
                upeerId: senderUpeerId,
                status: 'pending'
            });
            (identity.verify as any).mockReturnValue(true);

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsKeys.updateContactSignedPreKey).toHaveBeenCalled();
        });

        it('should handle invalid signed prekey in handleHandshakeAccept', async () => {
            const data = {
                publicKey: validPubKey,
                signedPreKey: { spkPub: 'pub', spkSig: 'sig', spkId: 1 }
            };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({
                upeerId: senderUpeerId,
                status: 'pending'
            });
            // El primer call es para el handshake (debe ser true)
            // El segundo call es para el SPK (debe ser false)
            (identity.verify as any)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsKeys.updateContactSignedPreKey).not.toHaveBeenCalled();
        });

        it('should handle SPK verification exception in handleHandshakeReq', async () => {
            const data = {
                publicKey: validPubKey,
                powProof: 'valid-proof',
                signedPreKey: { spkPub: 'pub', spkSig: 'sig', spkId: 1 }
            };
            (identity.verify as any)
                .mockReturnValueOnce(true) // Main sig
                .mockImplementationOnce(() => { throw new Error('CRYPTO_ERROR'); }); // SPK sig throw

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            // Check coverage for catch block
        });

        it('should handle SPK verification exception in handleHandshakeAccept', async () => {
            const data = {
                publicKey: validPubKey,
                signedPreKey: { spkPub: 'pub', spkSig: 'sig', spkId: 1 }
            };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ status: 'pending' });
            (identity.verify as any)
                .mockReturnValueOnce(true) // Main sig
                .mockImplementationOnce(() => { throw new Error('CRYPTO_ERROR_ACC'); }); // SPK sig throw

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            // Check coverage for catch block
        });

        it('should handle avatar and alias sanitization in handleHandshakeReq', async () => {
            const data = {
                publicKey: validPubKey,
                powProof: 'valid-proof',
                alias: 'A'.repeat(200),
                avatar: 'data:image/png;base64,valid'
            };

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.addOrUpdateContact).toHaveBeenCalledWith(
                senderUpeerId, rinfo.address, 'A'.repeat(100), expect.anything(), 'incoming', undefined, undefined, undefined, undefined, undefined
            );
            expect(contactsOps.updateContactAvatar).toHaveBeenCalled();
        });

        it('should handle avatar and alias sanitization in handleHandshakeAccept', async () => {
            const data = {
                publicKey: validPubKey,
                alias: 'B'.repeat(200),
                avatar: 'data:image/png;base64,valid'
            };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ status: 'pending', name: 'Original' });

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.updateContactName).toHaveBeenCalledWith(senderUpeerId, 'B'.repeat(100));
            expect(contactsOps.updateContactAvatar).toHaveBeenCalled();
        });

        it('should skip avatar if too large or invalid format', async () => {
            const data = {
                publicKey: validPubKey,
                avatar: 'invalid-avatar' // No data:image/
            };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ status: 'pending' });

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.updateContactAvatar).not.toHaveBeenCalled();

            const dataLarge = {
                publicKey: validPubKey,
                avatar: 'data:image/png;base64,' + 'A'.repeat(2_000_001)
            };
            await handleHandshakeAccept(dataLarge, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.updateContactAvatar).not.toHaveBeenCalled();
        });

        it('should handle invalid signed prekey in handleHandshakeReq', async () => {
            const data = {
                publicKey: validPubKey,
                powProof: 'valid-proof',
                signedPreKey: { spkPub: 'pub', spkSig: 'sig', spkId: 1 }
            };
            (identity.verify as any)
                .mockReturnValueOnce(true) // Main sig
                .mockReturnValueOnce(false); // SPK sig invalid

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsKeys.updateContactSignedPreKey).not.toHaveBeenCalled();
        });

        it('should handle missing SPK components in handleHandshakeReq', async () => {
            const data = {
                publicKey: validPubKey,
                powProof: 'valid-proof',
                signedPreKey: { spkPub: 'pub' } // Missing sig and id
            };
            (identity.verify as any).mockReturnValue(true);
            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsKeys.updateContactSignedPreKey).not.toHaveBeenCalled();
        });

        it('should handle missing SPK components in handleHandshakeAccept', async () => {
            const data = {
                publicKey: validPubKey,
                signedPreKey: { spkId: 1 } // Missing pub and sig
            };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ status: 'pending' });
            (identity.verify as any).mockReturnValue(true);
            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsKeys.updateContactSignedPreKey).not.toHaveBeenCalled();
        });

        it('should handle transaction error in handleHandshakeAccept', async () => {
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ status: 'pending' });
            // Mock manual de runTransaction para que falle específicamente aquí
            const shared = await import('../../../src/main_process/storage/shared');
            (shared.runTransaction as any).mockImplementationOnce(() => {
                throw new Error('TX_FAIL');
            });

            await handleHandshakeAccept({ publicKey: validPubKey }, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            // Debería capturar el error y no explotar
        });

        it('should handle flushPendingOutbox failure in handleHandshakeAccept', async () => {
            const data = { publicKey: validPubKey };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ status: 'pending' });
            vi.spyOn(pendingOutbox, 'flushPendingOutbox').mockRejectedValueOnce(new Error('FLUSH_FAIL'));

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            // Debería capturar el error silenciosamente según el código
            expect(pendingOutbox.flushPendingOutbox).toHaveBeenCalled();
        });
    });
});
