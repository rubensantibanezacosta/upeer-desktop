import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    savePendingOutboxMessage,
    getPendingOutboxMessages,
    deletePendingOutboxMessage,
    flushPendingOutbox
} from '../../../src/main_process/storage/pending-outbox.js';
import { getDb } from '../../../src/main_process/storage/shared.js';
import { pendingOutbox } from '../../../src/main_process/storage/schema.js';

vi.mock('../../../src/main_process/storage/shared.js');
vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(async () => null),
}));
vi.mock('../../../src/main_process/security/secure-logger.js');

// Mock dynamically imported modules
vi.mock('../../../src/main_process/security/identity.js', () => ({
    encrypt: vi.fn(() => ({ ciphertext: 'cipher', nonce: 'nonce' })),
    getMyEphemeralPublicKeyHex: vi.fn(() => '22'.repeat(32)),
    getMyIdentitySkBuffer: vi.fn(() => Buffer.alloc(32)),
    getMyPublicKeyHex: vi.fn(() => '11'.repeat(32)),
    getMyUPeerId: vi.fn(() => 'my-id'),
    sign: vi.fn(() => Buffer.from('sig')),
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    canonicalStringify: vi.fn((data) => JSON.stringify(data)),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        replicateToVaults: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('../../../src/main_process/storage/ratchet/operations.js', () => ({
    getRatchetSession: vi.fn(() => null),
    saveRatchetSession: vi.fn(),
}));

vi.mock('../../../src/main_process/network/messaging/chatEncryption.js', () => ({
    encryptChatPayload: vi.fn(async (_recipientSid: string, _plaintext: string, contact: { signedPreKey?: string | null; signedPreKeyId?: number | null }) => {
        if (contact.signedPreKey && typeof contact.signedPreKeyId === 'number') {
            return {
                content: 'ratchet-cipher',
                nonce: 'ratchet-nonce',
                ratchetHeader: { dh: '44'.repeat(32), pn: 0, n: 0 },
                x3dhInit: {
                    ekPub: '33'.repeat(32),
                    spkId: contact.signedPreKeyId,
                    ikPub: '11'.repeat(32),
                },
            };
        }

        return {
            content: 'cipher',
            nonce: 'nonce',
            ephemeralPublicKey: '22'.repeat(32),
            useRecipientEphemeral: false,
        };
    }),
}));

vi.mock('../../../src/main_process/security/ratchet.js', () => ({
    x3dhInitiator: vi.fn(() => ({
        ekPub: Buffer.from('33'.repeat(32), 'hex'),
        sharedSecret: Buffer.alloc(32, 7),
    })),
    ratchetInitAlice: vi.fn(() => ({ rk: Buffer.alloc(32) })),
    ratchetEncrypt: vi.fn(() => ({
        header: { dh: '44'.repeat(32), pn: 0, n: 0 },
        ciphertext: 'ratchet-cipher',
        nonce: 'ratchet-nonce',
    })),
}));

describe('storage/pending-outbox.ts', () => {
    const mockDb = {
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockResolvedValue(undefined),
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockReturnThis(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getDb).mockReturnValue(mockDb as ReturnType<typeof getDb>);
    });

    describe('savePendingOutboxMessage', () => {
        it('should insert a message into the pendingOutbox table', async () => {
            await savePendingOutboxMessage('recipient-id', 'msg-uuid', 'hello world', 'reply-to-id');

            expect(mockDb.insert).toHaveBeenCalledWith(pendingOutbox);
            expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({
                recipientSid: 'recipient-id',
                msgId: 'msg-uuid',
                plaintext: 'hello world',
                replyTo: 'reply-to-id'
            }));
        });
    });

    describe('getPendingOutboxMessages', () => {
        it('should select messages for a specific recipient', async () => {
            const mockMessages = [{ id: 1, plaintext: 'hi' }];
            mockDb.where.mockResolvedValue(mockMessages);

            const results = await getPendingOutboxMessages('recipient-id');

            expect(mockDb.select).toHaveBeenCalled();
            expect(mockDb.from).toHaveBeenCalledWith(pendingOutbox);
            expect(results).toEqual(mockMessages);
        });
    });

    describe('deletePendingOutboxMessage', () => {
        it('should delete a message by its numeric id', async () => {
            await deletePendingOutboxMessage(123);

            expect(mockDb.delete).toHaveBeenCalledWith(pendingOutbox);
            expect(mockDb.where).toHaveBeenCalled();
        });
    });

    describe('flushPendingOutbox', () => {
        it('should encrypt and replicate messages when flushing', async () => {
            const mockMessages = [
                { id: 10, msgId: 'uuid1', plaintext: 'msg1', recipientSid: 'sid1', replyTo: null }
            ];
            // Setup second mock for the inner calls (select vs delete)
            mockDb.where.mockResolvedValueOnce(mockMessages); // getPendingOutboxMessages

            await flushPendingOutbox('sid1', '00'.repeat(32));

            const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
            expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
                'sid1',
                expect.objectContaining({
                    id: 'uuid1',
                    senderUpeerId: 'my-id',
                    content: 'cipher',
                    nonce: 'nonce',
                })
            );
            expect(mockDb.delete).toHaveBeenCalled();
        });

        it('should log a warning if an error occurs during processing', async () => {
            const { warn } = await import('../../../src/main_process/security/secure-logger.js');
            const { encryptChatPayload } = await import('../../../src/main_process/network/messaging/chatEncryption.js');
            const mockMessages = [{ id: 10, msgId: 'u1', plaintext: 'p1', recipientSid: 's1' }];
            mockDb.where.mockResolvedValueOnce(mockMessages);

            vi.mocked(encryptChatPayload).mockRejectedValueOnce(new Error('encryption-fail'));

            await flushPendingOutbox('s1', '00'.repeat(32));

            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('failed to flush message'),
                expect.objectContaining({ error: expect.any(Error) }),
                'vault'
            );
        });

        it('should use Double Ratchet for flushed messages when the contact has signedPreKey', async () => {
            const mockMessages = [
                { id: 10, msgId: 'uuid1', plaintext: 'msg1', recipientSid: 'sid1', replyTo: null }
            ];
            const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
            const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');

            mockDb.where.mockResolvedValueOnce(mockMessages);
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
                upeerId: 'sid1',
                publicKey: '00'.repeat(32),
                signedPreKey: 'bb'.repeat(32),
                signedPreKeyId: 9,
            });

            await flushPendingOutbox('sid1', '00'.repeat(32));

            expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
                'sid1',
                expect.objectContaining({
                    id: 'uuid1',
                    senderUpeerId: 'my-id',
                    ratchetHeader: { dh: '44'.repeat(32), pn: 0, n: 0 },
                    x3dhInit: {
                        ekPub: '33'.repeat(32),
                        spkId: 9,
                        ikPub: '11'.repeat(32),
                    },
                })
            );
            expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
                'sid1',
                expect.not.objectContaining({ ephemeralPublicKey: expect.anything() })
            );
        });

        it('should return early if no messages are found', async () => {
            mockDb.where.mockResolvedValue([]);
            await flushPendingOutbox('sid-none', 'pubkey');
            expect(mockDb.delete).not.toHaveBeenCalled();
        });
    });
});
