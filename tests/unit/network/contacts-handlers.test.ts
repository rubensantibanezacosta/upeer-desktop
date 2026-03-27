import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleHandshakeReq, handleHandshakeAccept } from '../../../src/main_process/network/handlers/contacts.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations';
import * as contactsKeys from '../../../src/main_process/storage/contacts/keys';
import * as identity from '../../../src/main_process/security/identity';
import * as pow from '../../../src/main_process/security/pow';
import * as reputation from '../../../src/main_process/security/reputation/vouches';
import * as pendingOutbox from '../../../src/main_process/storage/pending-outbox';
import * as shared from '../../../src/main_process/storage/shared';

type HandshakeReqData = Parameters<typeof handleHandshakeReq>[0];
type HandshakeAcceptData = Parameters<typeof handleHandshakeAccept>[0];
type HandshakeRinfo = Parameters<typeof handleHandshakeReq>[4];
type HandshakeWindow = NonNullable<Parameters<typeof handleHandshakeReq>[5]>;
type HandshakeSendResponse = Parameters<typeof handleHandshakeReq>[6];
type KnownContact = NonNullable<Awaited<ReturnType<typeof contactsOps.getContactByUpeerId>>>;
type AddressContact = NonNullable<Awaited<ReturnType<typeof contactsOps.getContactByAddress>>>;
type KeyUpdateResult = ReturnType<typeof contactsKeys.updateContactPublicKey>;

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

const mockWin = {
    webContents: {
        send: vi.fn()
    }
} as unknown as HandshakeWindow;

describe('Contact Handlers', () => {
    const rinfo: HandshakeRinfo = { address: '1.2.3.4', port: 12345 };
    const validPubKey = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
    const senderUpeerId = "peer-" + validPubKey.slice(0, 8);
    const senderYggAddress = 'ygg-addr';
    const mockSendResponse = vi.fn<HandshakeSendResponse>();
    const pendingContact = { upeerId: senderUpeerId, status: 'pending' } as KnownContact;
    const connectedContact = { upeerId: senderUpeerId, status: 'connected', publicKey: validPubKey } as KnownContact;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(identity.getUPeerIdFromPublicKey).mockImplementation((pk) => "peer-" + pk.toString('hex').slice(0, 8));
        vi.mocked(pow.AdaptivePow.verifyLightProof).mockReturnValue(true);
        vi.mocked(reputation.computeScore).mockReturnValue(100);
        vi.mocked(contactsOps.isContactBlocked).mockReturnValue(false);
    });

    describe('handleHandshakeReq', () => {
        it('should accept handshake from a new contact with valid PoW', async () => {
            const data: HandshakeReqData = {
                publicKey: validPubKey,
                powProof: 'valid-proof',
                alias: 'Alice'
            };

            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(null);

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
            const data: HandshakeReqData = { publicKey: validPubKey, alias: 'NoPOW' };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(null);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
        });

        it('should handle re-handshake from already connected contact', async () => {
            const data: HandshakeReqData = { publicKey: validPubKey, alias: 'Alice (updated)' };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

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
            const data: HandshakeReqData = { publicKey: validPubKey };
            vi.mocked(contactsOps.isContactBlocked).mockReturnValue(true);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
        });

        it('should block if signature verification fails in handleHandshakeReq', async () => {
            const data: HandshakeReqData = { publicKey: validPubKey };
            vi.mocked(identity.verify).mockReturnValue(false);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
        });

        it('should fail if upeerId does not match public key in handleHandshakeReq', async () => {
            const data: HandshakeReqData = { publicKey: validPubKey };
            await handleHandshakeReq(data, 'sig', 'mismatch-id', senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
        });

        it('should alert if reputation is too low (untrustworthy)', async () => {
            const data: HandshakeReqData = { publicKey: validPubKey, alias: 'BadPeer', powProof: 'valid-proof' };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(null);
            vi.mocked(reputation.computeScore).mockReturnValue(30);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(mockWin.webContents.send).toHaveBeenCalledWith('contact-untrustworthy', expect.objectContaining({
                upeerId: senderUpeerId
            }));
        });

        it('should alert on TOFU (key change) in handleHandshakeReq', async () => {
            const data: HandshakeReqData = { publicKey: validPubKey, alias: 'Alice' };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
                upeerId: senderUpeerId,
                status: 'connected',
                publicKey: 'another-key'
            } as KnownContact);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(mockWin.webContents.send).toHaveBeenCalledWith('key-change-alert', expect.objectContaining({
                upeerId: senderUpeerId
            }));
        });
    });

    describe('handleHandshakeAccept', () => {
        it('should upgrade pending contact to connected', async () => {
            const data: HandshakeAcceptData = { publicKey: validPubKey, alias: 'Bob' };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
                upeerId: senderUpeerId,
                status: 'pending',
                name: 'Bob Pending'
            } as KnownContact);
            vi.mocked(contactsKeys.updateContactPublicKey).mockReturnValue({ changed: false } as KeyUpdateResult);

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
            const data: HandshakeAcceptData = { publicKey: validPubKey, alias: 'Bob' };
            vi.mocked(contactsOps.getContactByAddress).mockResolvedValue({ upeerId: 'pending-ghost' } as AddressContact);
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(pendingContact);
            vi.mocked(contactsKeys.updateContactPublicKey).mockReturnValue({ changed: false } as KeyUpdateResult);

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.deleteContact).toHaveBeenCalledWith('pending-ghost');
        });

        it('should skip update if contact is not pending in handleHandshakeAccept', async () => {
            const data: HandshakeAcceptData = { publicKey: validPubKey };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsKeys.updateContactPublicKey).not.toHaveBeenCalled();
        });

        it('should fail if signature verification fails in handleHandshakeAccept', async () => {
            const data: HandshakeAcceptData = { publicKey: validPubKey };
            vi.mocked(identity.verify).mockReturnValue(false);

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
        });

        it('should fail on missing fields in handleHandshakeAccept', async () => {
            const data: HandshakeAcceptData = {};
            await handleHandshakeAccept(data, '', '', '', rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
        });

        it('should fail on rate limit in handleHandshakeAccept', async () => {
            const data: HandshakeAcceptData = { publicKey: validPubKey, type: 'HANDSHAKE_ACCEPT' };
            const { IdentityRateLimiter } = await import('../../../src/main_process/security/identity-rate-limiter');
            const spy = vi.spyOn(IdentityRateLimiter.prototype, 'checkIdentity').mockReturnValueOnce(false);

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsOps.getContactByAddress).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('should fail on rate limit in handleHandshakeReq', async () => {
            const data: HandshakeReqData = { publicKey: validPubKey, powProof: 'valid', type: 'HANDSHAKE_REQ' };
            const { IdentityRateLimiter } = await import('../../../src/main_process/security/identity-rate-limiter');
            const spy = vi.spyOn(IdentityRateLimiter.prototype, 'checkIdentity').mockReturnValueOnce(false);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.getContactByUpeerId).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('should fail on upeerId mismatch in handleHandshakeAccept', async () => {
            const data: HandshakeAcceptData = { publicKey: validPubKey };
            vi.mocked(identity.verify).mockReturnValue(true);
            await handleHandshakeAccept(data, 'sig', 'mismatch', senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.addOrUpdateContact).not.toHaveBeenCalled();
        });

        it('should handle legacy signature in handleHandshakeAccept', async () => {
            const data: HandshakeAcceptData = { publicKey: validPubKey };
            vi.mocked(identity.verify)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true);
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(pendingContact);

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.addOrUpdateContact).toHaveBeenCalled();
        });

        it('should handle even more legacy signature in handleHandshakeAccept', async () => {
            const data: HandshakeAcceptData = { publicKey: validPubKey };
            vi.mocked(identity.verify)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true);
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(pendingContact);

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.addOrUpdateContact).toHaveBeenCalled();
        });

        it('should alert on key-change (TOFU) during handleHandshakeAccept', async () => {
            const data: HandshakeAcceptData = { publicKey: validPubKey, avatar: 'data:image/png;base64,123', addresses: ['ipv6'] };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
                upeerId: senderUpeerId,
                status: 'pending',
                publicKey: 'OLD-pubkey'
            } as KnownContact);
            vi.mocked(contactsKeys.updateContactPublicKey).mockReturnValue({ changed: true, oldKey: 'OLD-pubkey', newKey: validPubKey } as KeyUpdateResult);

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(mockWin.webContents.send).toHaveBeenCalledWith('key-change-alert', expect.objectContaining({
                upeerId: senderUpeerId
            }));
            expect(contactsOps.updateContactAvatar).toHaveBeenCalled();
        });

        it('should verify and update signed prekey in handleHandshakeAccept', async () => {
            const data: HandshakeAcceptData = {
                publicKey: validPubKey,
                signedPreKey: { spkPub: 'pub', spkSig: 'sig', spkId: 1 }
            };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
                upeerId: senderUpeerId,
                status: 'pending'
            } as KnownContact);
            vi.mocked(identity.verify).mockReturnValue(true);

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsKeys.updateContactSignedPreKey).toHaveBeenCalled();
        });

        it('should handle invalid signed prekey in handleHandshakeAccept', async () => {
            const data: HandshakeAcceptData = {
                publicKey: validPubKey,
                signedPreKey: { spkPub: 'pub', spkSig: 'sig', spkId: 1 }
            };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
                upeerId: senderUpeerId,
                status: 'pending'
            } as KnownContact);
            vi.mocked(identity.verify)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');

            expect(contactsKeys.updateContactSignedPreKey).not.toHaveBeenCalled();
        });

        it('should handle SPK verification exception in handleHandshakeReq', async () => {
            const data: HandshakeReqData = {
                publicKey: validPubKey,
                powProof: 'valid-proof',
                signedPreKey: { spkPub: 'pub', spkSig: 'sig', spkId: 1 }
            };
            vi.mocked(identity.verify)
                .mockReturnValueOnce(true)
                .mockImplementationOnce(() => { throw new Error('CRYPTO_ERROR'); });

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
        });

        it('should handle SPK verification exception in handleHandshakeAccept', async () => {
            const data: HandshakeAcceptData = {
                publicKey: validPubKey,
                signedPreKey: { spkPub: 'pub', spkSig: 'sig', spkId: 1 }
            };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(pendingContact);
            vi.mocked(identity.verify)
                .mockReturnValueOnce(true)
                .mockImplementationOnce(() => { throw new Error('CRYPTO_ERROR_ACC'); });

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
        });

        it('should handle avatar and alias sanitization in handleHandshakeReq', async () => {
            const data: HandshakeReqData = {
                publicKey: validPubKey,
                powProof: 'valid-proof',
                alias: 'A'.repeat(200),
                avatar: 'data:image/png;base64,valid'
            };

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.addOrUpdateContact).toHaveBeenCalledWith(
                senderUpeerId, rinfo.address, 'A'.repeat(100), expect.anything(), 'connected', undefined, undefined, undefined, undefined, undefined
            );
            expect(contactsOps.updateContactAvatar).toHaveBeenCalled();
        });

        it('should handle avatar and alias sanitization in handleHandshakeAccept', async () => {
            const data: HandshakeAcceptData = {
                publicKey: validPubKey,
                alias: 'B'.repeat(200),
                avatar: 'data:image/png;base64,valid'
            };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ status: 'pending', name: 'Original' } as KnownContact);

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.updateContactName).toHaveBeenCalledWith(senderUpeerId, 'B'.repeat(100));
            expect(contactsOps.updateContactAvatar).toHaveBeenCalled();
        });

        it('should skip avatar if too large or invalid format', async () => {
            const data: HandshakeAcceptData = {
                publicKey: validPubKey,
                avatar: 'invalid-avatar'
            };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(pendingContact);

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.updateContactAvatar).not.toHaveBeenCalled();

            const dataLarge: HandshakeAcceptData = {
                publicKey: validPubKey,
                avatar: 'data:image/png;base64,' + 'A'.repeat(2_000_001)
            };
            await handleHandshakeAccept(dataLarge, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsOps.updateContactAvatar).not.toHaveBeenCalled();
        });

        it('should handle invalid signed prekey in handleHandshakeReq', async () => {
            const data: HandshakeReqData = {
                publicKey: validPubKey,
                powProof: 'valid-proof',
                signedPreKey: { spkPub: 'pub', spkSig: 'sig', spkId: 1 }
            };
            vi.mocked(identity.verify)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);

            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsKeys.updateContactSignedPreKey).not.toHaveBeenCalled();
        });

        it('should handle missing SPK components in handleHandshakeReq', async () => {
            const data: HandshakeReqData = {
                publicKey: validPubKey,
                powProof: 'valid-proof',
                signedPreKey: { spkPub: 'pub' }
            };
            vi.mocked(identity.verify).mockReturnValue(true);
            await handleHandshakeReq(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsKeys.updateContactSignedPreKey).not.toHaveBeenCalled();
        });

        it('should handle missing SPK components in handleHandshakeAccept', async () => {
            const data: HandshakeAcceptData = {
                publicKey: validPubKey,
                signedPreKey: { spkId: 1 }
            };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(pendingContact);
            vi.mocked(identity.verify).mockReturnValue(true);
            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(contactsKeys.updateContactSignedPreKey).not.toHaveBeenCalled();
        });

        it('should handle transaction error in handleHandshakeAccept', async () => {
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(pendingContact);
            vi.spyOn(shared, 'runTransaction').mockImplementationOnce(() => {
                throw new Error('TX_FAIL');
            });

            await handleHandshakeAccept({ publicKey: validPubKey }, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
        });

        it('should handle flushPendingOutbox failure in handleHandshakeAccept', async () => {
            const data: HandshakeAcceptData = { publicKey: validPubKey };
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(pendingContact);
            vi.spyOn(pendingOutbox, 'flushPendingOutbox').mockRejectedValueOnce(new Error('FLUSH_FAIL'));

            await handleHandshakeAccept(data, 'sig', senderUpeerId, senderYggAddress, rinfo, mockWin, mockSendResponse, '1.2.3.4');
            expect(pendingOutbox.flushPendingOutbox).toHaveBeenCalled();
        });
    });
});
