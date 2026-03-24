import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChatMessage, handleChatAck, handleChatEdit, handleChatDelete, handleChatReaction, handleChatClear, handleReadReceipt } from '../../../src/main_process/network/handlers/chat.js';
import * as messagesOps from '../../../src/main_process/storage/messages/operations.js';
import * as reactionsOps from '../../../src/main_process/storage/messages/reactions.js';
import * as contactKeysOps from '../../../src/main_process/storage/contacts/keys.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as reputation from '../../../src/main_process/security/reputation/vouches.js';
import * as ratchet from '../../../src/main_process/security/ratchet.js';

// Mock de dependencias
vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveMessage: vi.fn(),
    updateMessageStatus: vi.fn(),
    updateMessageContent: vi.fn(),
    deleteMessageLocally: vi.fn(),
    getMessageById: vi.fn(),
    deleteMessagesByChatId: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/reactions.js', () => ({
    saveReaction: vi.fn(),
    deleteReaction: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/keys.js', () => ({
    updateContactEphemeralPublicKey: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    decrypt: vi.fn(),
    getMyUPeerId: vi.fn(() => 'my-peer-id'),
    getSpkBySpkId: vi.fn(),
    getMyIdentitySkBuffer: vi.fn(),
    getMySignedPreKeyBundle: vi.fn(() => ({
        signedPreKeyPublic: 'ab'.repeat(32),
        signedPreKeySig: 'cd'.repeat(64),
        signedPreKeyId: Date.now(),
    })),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    issueVouch: vi.fn(async () => { }),
    VouchType: { HANDSHAKE: 'HANDSHAKE' }
}));

vi.mock('../../../src/main_process/security/ratchet.js', async () => {
    const actual = await vi.importActual('../../../src/main_process/security/ratchet.js');
    return {
        ...actual as any,
        x3dhResponder: vi.fn(),
        ratchetInitBob: vi.fn(),
        ratchetDecrypt: vi.fn(),
    };
});

vi.mock('../../../src/main_process/storage/ratchet/operations.js', () => ({
    getRatchetSession: vi.fn(() => null),
    saveRatchetSession: vi.fn(),
    deleteRatchetSession: vi.fn(),
}));

vi.mock('../../../src/main_process/network/file-transfer/transfer-manager.js', () => ({
    fileTransferManager: {
        cancelTransfer: vi.fn(),
    },
}));

vi.mock('../../../src/main_process/utils/localAttachmentCleanup.js', () => ({
    extractLocalAttachmentInfo: vi.fn(),
    cleanupLocalAttachmentFile: vi.fn(),
}));

// Mock de Electron
const mockWin = {
    webContents: {
        send: vi.fn()
    }
} as any;

describe('Chat Handlers', () => {
    const senderId = 'sender-id';
    const mockContact = { upeerId: senderId, publicKey: 'sender-pubkey' };
    const mockSendResponse = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleChatMessage', () => {
        it('should process a simple unencrypted message', async () => {
            const data = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'hola p2p',
                timestamp: Date.now()
            };

            (messagesOps.saveMessage as any).mockResolvedValue({ changes: 1 });
            (messagesOps.getMessageById as any).mockResolvedValue(null);

            await handleChatMessage(senderId, mockContact, data, mockWin, 'sig', '1.2.3.4', mockSendResponse);

            expect(messagesOps.saveMessage).toHaveBeenCalledWith(
                data.id,
                senderId,
                false,
                'hola p2p',
                undefined,
                'sig',
                'delivered',
                senderId,
                data.timestamp
            );

            expect(mockWin.webContents.send).toHaveBeenCalledWith('receive-p2p-message', expect.objectContaining({
                message: 'hola p2p',
                id: data.id,
                timestamp: data.timestamp
            }));

            expect(mockSendResponse).toHaveBeenCalledWith('1.2.3.4', expect.objectContaining({
                type: 'ACK',
                status: 'delivered'
            }));

            // El handshake vouch debería emitirse
            expect(reputation.issueVouch).toHaveBeenCalledWith(senderId, 'HANDSHAKE');
        });

        it('should decrypt a message if nonce is provided', async () => {
            const data = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'encrypted-hex',
                nonce: 'nonce-hex'
            };

            (identity.decrypt as any).mockReturnValue(Buffer.from('mensaje descifrado'));
            (messagesOps.saveMessage as any).mockResolvedValue({ changes: 1 });

            await handleChatMessage(senderId, mockContact, data, mockWin, 'sig', '1.2.3.4', mockSendResponse);

            expect(identity.decrypt).toHaveBeenCalled();
            expect(messagesOps.saveMessage).toHaveBeenCalledWith(
                expect.any(String),
                senderId,
                false,
                'mensaje descifrado',
                undefined,
                'sig',
                'delivered',
                senderId,
                undefined
            );
        });

        it('should prefer sender ephemeral public key when decrypting crypto_box messages', async () => {
            const data = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'aa',
                nonce: 'bb',
                ephemeralPublicKey: 'a'.repeat(64),
                useRecipientEphemeral: false,
            };

            (identity.decrypt as any).mockReturnValue(Buffer.from('mensaje vault'));
            (messagesOps.saveMessage as any).mockResolvedValue({ changes: 1 });

            await handleChatMessage(senderId, mockContact, data, mockWin, 'sig', '1.2.3.4', mockSendResponse);

            expect(identity.decrypt).toHaveBeenCalledWith(
                Buffer.from(data.nonce, 'hex'),
                Buffer.from(data.content, 'hex'),
                Buffer.from(data.ephemeralPublicKey, 'hex')
            );
            expect(messagesOps.saveMessage).toHaveBeenCalledWith(
                expect.any(String),
                senderId,
                false,
                'mensaje vault',
                undefined,
                'sig',
                'delivered',
                senderId,
                undefined
            );
        });

        it('should handle decryption failure gracefully', async () => {
            const data = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'bad-data',
                nonce: 'nonce'
            };

            (identity.decrypt as any).mockReturnValue(null);
            (messagesOps.saveMessage as any).mockResolvedValue({ changes: 1 });

            await handleChatMessage(senderId, mockContact, data, mockWin, 'sig', '1.2.3.4', mockSendResponse);

            expect(messagesOps.saveMessage).toHaveBeenCalledWith(
                expect.any(String),
                senderId,
                false,
                '🔒 [Error de descifrado]',
                undefined,
                'sig',
                'delivered',
                senderId,
                undefined
            );
        });

        it('should skip processing if message ID already exists (deduplication)', async () => {
            const data = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'repetido'
            };

            (messagesOps.getMessageById as any).mockResolvedValue({ id: data.id });

            await handleChatMessage(senderId, mockContact, data, mockWin, 'sig', '1.2.3.4', mockSendResponse);

            expect(messagesOps.saveMessage).not.toHaveBeenCalled();
            expect(mockSendResponse).toHaveBeenCalledWith('1.2.3.4', expect.objectContaining({
                type: 'ACK',
                status: 'delivered'
            }));
        });

        it('should handle internal sync messages without saving if they already exist', async () => {
            const myId = 'my-peer-id';
            const data = {
                id: '11111111-1111-1111-1111-111111111111',
                content: 'sync-msg',
                isInternalSync: true
            };

            (identity.getMyUPeerId as any).mockReturnValue(myId);
            (messagesOps.getMessageById as any).mockResolvedValue({ id: data.id });

            await handleChatMessage(myId, mockContact, data, mockWin, 'sig', '127.0.0.1', mockSendResponse);

            expect(messagesOps.saveMessage).not.toHaveBeenCalled();
            // El return corta antes de mandar el ACK
            expect(mockSendResponse).not.toHaveBeenCalled();
        });

        it('should update contact ephemeral public key if provided in message data', async () => {
            const data = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'hello',
                ephemeralPublicKey: 'a'.repeat(64)
            };

            (messagesOps.getMessageById as any).mockResolvedValue(null);
            (messagesOps.saveMessage as any).mockResolvedValue({ changes: 1 });
            const keysOps = await import('../../../src/main_process/storage/contacts/keys.js');

            await handleChatMessage(senderId, mockContact, data, mockWin, 'sig', '1.2.3.4', mockSendResponse);

            expect(keysOps.updateContactEphemeralPublicKey).toHaveBeenCalledWith(senderId, data.ephemeralPublicKey);
        });

        it('should handle X3DH and Double Ratchet initialization from Bob perspective', async () => {
            const data = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'encrypted-dr-payload',
                nonce: 'nonce-dr',
                ratchetHeader: { pn: 0, n: 0, dh: 'pub-a' },
                x3dhInit: {
                    ekPub: 'ek-alice',
                    ikPub: 'ik-alice',
                    spkId: 99
                }
            };

            (ratchet.x3dhResponder as any).mockReturnValue(Buffer.alloc(32));
            (ratchet.ratchetInitBob as any).mockReturnValue({});
            (ratchet.ratchetDecrypt as any).mockReturnValue(Buffer.from('dr-decrypted-content'));

            (identity.getSpkBySpkId as any).mockReturnValue({ spkPk: Buffer.alloc(32), spkSk: Buffer.alloc(32) });
            (identity.getMyIdentitySkBuffer as any).mockReturnValue(Buffer.alloc(64));
            (messagesOps.saveMessage as any).mockResolvedValue({ changes: 1 });

            await handleChatMessage(senderId, mockContact, data, mockWin, 'sig', '1.2.3.4', mockSendResponse);

            expect(messagesOps.saveMessage).toHaveBeenCalledWith(
                expect.any(String),
                senderId,
                false,
                'dr-decrypted-content',
                undefined,
                'sig',
                'delivered',
                senderId,
                undefined
            );
        });

        it('should handle X3DH error when SPK is missing', async () => {
            const data = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'bad-dr',
                ratchetHeader: {},
                x3dhInit: { spkId: 404 }
            };

            (identity.getSpkBySpkId as any).mockReturnValue(null);
            (messagesOps.saveMessage as any).mockResolvedValue({ changes: 1 });

            await handleChatMessage(senderId, mockContact, data, mockWin, 'sig', '1.2.3.4', mockSendResponse);

            expect(messagesOps.saveMessage).toHaveBeenCalledWith(
                expect.any(String),
                senderId,
                false,
                '🔒 [Error crítico DR]',
                undefined,
                'sig',
                'delivered',
                senderId,
                undefined
            );
        });
    });

    describe('handleChatAck', () => {
        it('should update message status if it is mine', async () => {
            const data = { id: '12345678-1234-1234-1234-123456789012', status: 'read' };
            (messagesOps.getMessageById as any).mockResolvedValue({ id: data.id, chatUpeerId: senderId, isMine: 1 });

            await handleChatAck(senderId, data, mockWin);

            expect(messagesOps.updateMessageStatus).toHaveBeenCalledWith(data.id, 'read');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-status-updated', {
                id: data.id,
                status: 'read'
            });
        });

        it('should not update if message is not mine', async () => {
            const data = { id: '12345678-1234-1234-1234-123456789012', status: 'read' };
            (messagesOps.getMessageById as any).mockResolvedValue({ id: data.id, chatUpeerId: senderId, isMine: 0 });

            await handleChatAck(senderId, data, mockWin);

            expect(messagesOps.updateMessageStatus).not.toHaveBeenCalled();
        });
    });

    describe('handleChatEdit', () => {
        it('should decrypt and update content if message is from the peer', async () => {
            const data = {
                msgId: '12345678-1234-1234-1234-123456789012',
                content: 'aa',
                nonce: 'bb',
                ephemeralPublicKey: 'a'.repeat(64),
                version: 2,
            };
            (messagesOps.getMessageById as any).mockResolvedValue({ id: data.msgId, chatUpeerId: senderId, isMine: 0 });
            const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'b'.repeat(64) });
            (identity.decrypt as any).mockReturnValue(Buffer.from('editado'));

            await handleChatEdit(senderId, data, mockWin, 'edit-sig');

            expect(contactKeysOps.updateContactEphemeralPublicKey).toHaveBeenCalledWith(senderId, data.ephemeralPublicKey);
            expect(messagesOps.updateMessageContent).toHaveBeenCalledWith(data.msgId, 'editado', 'edit-sig', 2);
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-updated', {
                id: data.msgId,
                upeerId: senderId,
                chatUpeerId: senderId,
                content: 'editado',
                signature: 'edit-sig'
            });
        });

        it('should fallback to stored ephemeral key when packet key is missing', async () => {
            const data = {
                msgId: '12345678-1234-1234-1234-123456789012',
                content: 'aa',
                nonce: 'bb',
                version: 3,
            };
            (messagesOps.getMessageById as any).mockResolvedValue({ id: data.msgId, chatUpeerId: senderId, isMine: 0 });
            const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({
                publicKey: 'b'.repeat(64),
                ephemeralPublicKey: 'c'.repeat(64)
            });
            (identity.decrypt as any).mockReturnValue(Buffer.from('editado 2'));

            await handleChatEdit(senderId, data, mockWin, 'edit-sig-2');

            expect(identity.decrypt).toHaveBeenCalledWith(
                Buffer.from(data.nonce, 'hex'),
                Buffer.from(data.content, 'hex'),
                Buffer.from('c'.repeat(64), 'hex')
            );
            expect(messagesOps.updateMessageContent).toHaveBeenCalledWith(data.msgId, 'editado 2', 'edit-sig-2', 3);
        });
    });

    describe('handleChatDelete', () => {
        it('should delete locally if message is from the peer', async () => {
            const data = { msgId: '12345678-1234-1234-1234-123456789012', timestamp: 1234 };
            (messagesOps.getMessageById as any).mockResolvedValue({ id: data.msgId, chatUpeerId: senderId, isMine: 0 });

            await handleChatDelete(senderId, data, mockWin);

            expect(messagesOps.deleteMessageLocally).toHaveBeenCalledWith(data.msgId, data.timestamp);
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-deleted', { id: data.msgId, upeerId: senderId, chatUpeerId: senderId });
        });

        it('should cleanup local attachment data for deleted file messages', async () => {
            const cleanup = await import('../../../src/main_process/utils/localAttachmentCleanup.js');
            const { fileTransferManager } = await import('../../../src/main_process/network/file-transfer/transfer-manager.js');
            const data = { msgId: '12345678-1234-1234-1234-123456789012', timestamp: 1234 };
            (messagesOps.getMessageById as any).mockResolvedValue({
                id: data.msgId,
                chatUpeerId: senderId,
                isMine: 0,
                message: JSON.stringify({ type: 'file', fileId: 'file-1', savedPath: '/tmp/upeer/file-1.bin' })
            });
            (cleanup.extractLocalAttachmentInfo as any).mockReturnValue({ fileId: 'file-1', filePath: '/tmp/upeer/file-1.bin' });

            await handleChatDelete(senderId, data, mockWin);

            expect(fileTransferManager.cancelTransfer).toHaveBeenCalledWith('file-1', 'message deleted');
            expect(cleanup.cleanupLocalAttachmentFile).toHaveBeenCalledWith('/tmp/upeer/file-1.bin');
        });
    });

    describe('handleChatReaction', () => {
        it('should save reaction and notify UI', async () => {
            const data = { id: '12345678-1234-1234-1234-123456789012', reaction: '👍' };

            await handleChatReaction(senderId, data, mockWin);

            expect(reactionsOps.saveReaction).toHaveBeenCalledWith(data.id, senderId, '👍');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-reaction-updated', {
                msgId: data.id,
                upeerId: senderId,
                chatUpeerId: senderId,
                emoji: '👍',
                remove: false
            });
        });

        it('should delete reaction if emojiToDelete is provided', async () => {
            const data = { id: '12345678-1234-1234-1234-123456789012', emojiToDelete: '👍' };

            await handleChatReaction(senderId, data, mockWin);

            expect(reactionsOps.deleteReaction).toHaveBeenCalledWith(data.id, senderId, '👍');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-reaction-updated', {
                msgId: data.id,
                upeerId: senderId,
                chatUpeerId: senderId,
                emoji: '👍',
                remove: true
            });
        });
    });

    describe('handleChatClear', () => {
        it('should clear messages for a chat ID', async () => {
            const data = { clearTimestamp: 1000 };
            await handleChatClear(senderId, data, mockWin);

            // En chat.ts se usa un import dinámico. Como tenemos mockeado el módulo,
            // podemos verificar la llamada en el objeto mockeado.
            expect(messagesOps.deleteMessagesByChatId).toHaveBeenCalledWith(senderId, 1000);
            expect(mockWin.webContents.send).toHaveBeenCalledWith('chat-cleared', { upeerId: senderId });
        });
    });

    describe('handleReadReceipt', () => {
        it('should update message status to read', async () => {
            const data = { id: '12345678-1234-1234-1234-123456789012' };
            await handleReadReceipt(senderId, data, mockWin);

            expect(messagesOps.updateMessageStatus).toHaveBeenCalledWith(data.id, 'read');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-status-updated', expect.objectContaining({
                id: data.id,
                status: 'read'
            }));
        });
    });
});
