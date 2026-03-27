import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChatMessage, handleChatAck, handleChatEdit, handleChatDelete, handleChatReaction, handleChatClear, handleReadReceipt } from '../../../src/main_process/network/handlers/chat.js';
import * as messagesOps from '../../../src/main_process/storage/messages/operations.js';
import * as reactionsOps from '../../../src/main_process/storage/messages/reactions.js';
import * as contactKeysOps from '../../../src/main_process/storage/contacts/keys.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as reputation from '../../../src/main_process/security/reputation/vouches.js';
import * as ratchet from '../../../src/main_process/security/ratchet.js';

type ChatWindow = NonNullable<Parameters<typeof handleChatMessage>[3]>;
type ChatContact = Parameters<typeof handleChatMessage>[1];
type ChatMessageData = Parameters<typeof handleChatMessage>[2];
type ChatAckData = Parameters<typeof handleChatAck>[1];
type ChatEditData = Parameters<typeof handleChatEdit>[1];
type ChatDeleteData = Parameters<typeof handleChatDelete>[1];
type ChatReactionData = Parameters<typeof handleChatReaction>[1];
type ChatClearData = Parameters<typeof handleChatClear>[1];
type ReadReceiptData = Parameters<typeof handleReadReceipt>[1];

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
    decryptWithIdentityKey: vi.fn(),
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
        ...(actual as object),
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
} as unknown as ChatWindow;

describe('Chat Handlers', () => {
    const senderId = 'sender-id';
    const mockContact: ChatContact = { upeerId: senderId, publicKey: 'sender-pubkey' };
    const mockSendResponse = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleChatMessage', () => {
        it('should process a simple unencrypted message', async () => {
            const data: ChatMessageData = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'hola p2p',
                timestamp: Date.now()
            };

            vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);
            vi.mocked(messagesOps.getMessageById).mockResolvedValue(null);

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
            const data: ChatMessageData = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'encrypted-hex',
                nonce: 'nonce-hex'
            };

            vi.mocked(identity.decrypt).mockReturnValue(Buffer.from('mensaje descifrado'));
            vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

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
            const data: ChatMessageData = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'aa',
                nonce: 'bb',
                ephemeralPublicKey: 'a'.repeat(64),
                useRecipientEphemeral: false,
            };

            vi.mocked(identity.decrypt).mockReturnValue(Buffer.from('mensaje vault'));
            vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

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

        it('should fall back to identity-key decryption for vaulted static-recipient messages', async () => {
            const data: ChatMessageData = {
                id: '33333333-3333-3333-3333-333333333333',
                content: 'aa',
                nonce: 'bb',
                ephemeralPublicKey: 'a'.repeat(64),
                useRecipientEphemeral: false,
            };

            vi.mocked(identity.decrypt).mockReturnValue(null);
            vi.mocked(identity.decryptWithIdentityKey).mockReturnValue(Buffer.from('mensaje vaulted recuperado'));
            vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

            await handleChatMessage(senderId, mockContact, data, mockWin, 'sig', '1.2.3.4', mockSendResponse);

            expect(identity.decryptWithIdentityKey).toHaveBeenCalledWith(
                Buffer.from(data.nonce, 'hex'),
                Buffer.from(data.content, 'hex'),
                Buffer.from(data.ephemeralPublicKey, 'hex')
            );
            expect(messagesOps.saveMessage).toHaveBeenCalledWith(
                data.id,
                senderId,
                false,
                'mensaje vaulted recuperado',
                undefined,
                'sig',
                'delivered',
                senderId,
                undefined
            );
        });

        it('should handle decryption failure gracefully', async () => {
            const data: ChatMessageData = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'bad-data',
                nonce: 'nonce'
            };

            vi.mocked(identity.decrypt).mockReturnValue(null);
            vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

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
            const data: ChatMessageData = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'repetido'
            };

            vi.mocked(messagesOps.getMessageById).mockResolvedValue({ id: data.id } as never);

            await handleChatMessage(senderId, mockContact, data, mockWin, 'sig', '1.2.3.4', mockSendResponse);

            expect(messagesOps.saveMessage).not.toHaveBeenCalled();
            expect(mockSendResponse).toHaveBeenCalledWith('1.2.3.4', expect.objectContaining({
                type: 'ACK',
                status: 'delivered'
            }));
        });

        it('should handle internal sync messages without saving if they already exist', async () => {
            const myId = 'my-peer-id';
            const data: ChatMessageData = {
                id: '11111111-1111-1111-1111-111111111111',
                content: 'sync-msg',
                isInternalSync: true
            };

            vi.mocked(identity.getMyUPeerId).mockReturnValue(myId);
            vi.mocked(messagesOps.getMessageById).mockResolvedValue({ id: data.id } as never);

            await handleChatMessage(myId, mockContact, data, mockWin, 'sig', '127.0.0.1', mockSendResponse);

            expect(messagesOps.saveMessage).not.toHaveBeenCalled();
            // El return corta antes de mandar el ACK
            expect(mockSendResponse).not.toHaveBeenCalled();
        });

        it('should decrypt and save vaulted self-sync messages as mine', async () => {
            const myId = 'my-peer-id';
            const data: ChatMessageData = {
                id: '22222222-2222-2222-2222-222222222222',
                content: 'aa',
                nonce: 'bb',
                ephemeralPublicKey: 'a'.repeat(64),
                isInternalSync: true,
                timestamp: Date.now()
            };

            vi.mocked(identity.getMyUPeerId).mockReturnValue(myId);
            vi.mocked(messagesOps.getMessageById).mockResolvedValue(null);
            vi.mocked(identity.decrypt).mockReturnValue(Buffer.from('mensaje propio vaulted'));
            vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

            await handleChatMessage(myId, { upeerId: myId, publicKey: 'b'.repeat(64) } as ChatContact, data, mockWin, 'sig', '127.0.0.1', mockSendResponse);

            expect(messagesOps.saveMessage).toHaveBeenCalledWith(
                data.id,
                myId,
                true,
                'mensaje propio vaulted',
                undefined,
                'sig',
                'read',
                myId,
                data.timestamp
            );
            expect(mockWin.webContents.send).toHaveBeenCalledWith('receive-p2p-message', expect.objectContaining({
                isMine: true,
                status: 'read',
                message: 'mensaje propio vaulted'
            }));
        });

        it('should update contact ephemeral public key if provided in message data', async () => {
            const data: ChatMessageData = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'hello',
                ephemeralPublicKey: 'a'.repeat(64)
            };

            vi.mocked(messagesOps.getMessageById).mockResolvedValue(null);
            vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);
            const keysOps = await import('../../../src/main_process/storage/contacts/keys.js');

            await handleChatMessage(senderId, mockContact, data, mockWin, 'sig', '1.2.3.4', mockSendResponse);

            expect(keysOps.updateContactEphemeralPublicKey).toHaveBeenCalledWith(senderId, data.ephemeralPublicKey);
        });

        it('should handle X3DH and Double Ratchet initialization from Bob perspective', async () => {
            const data: ChatMessageData = {
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

            vi.mocked(ratchet.x3dhResponder).mockReturnValue(Buffer.alloc(32));
            vi.mocked(ratchet.ratchetInitBob).mockReturnValue({} as never);
            vi.mocked(ratchet.ratchetDecrypt).mockReturnValue(Buffer.from('dr-decrypted-content'));

            vi.mocked(identity.getSpkBySpkId).mockReturnValue({ spkPk: Buffer.alloc(32), spkSk: Buffer.alloc(32) } as never);
            vi.mocked(identity.getMyIdentitySkBuffer).mockReturnValue(Buffer.alloc(64));
            vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

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
            const data: ChatMessageData = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'bad-dr',
                ratchetHeader: {},
                x3dhInit: { spkId: 404 }
            };

            vi.mocked(identity.getSpkBySpkId).mockReturnValue(null);
            vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

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
            const data: ChatAckData = { id: '12345678-1234-1234-1234-123456789012', status: 'read' };
            vi.mocked(messagesOps.getMessageById).mockResolvedValue({ id: data.id, chatUpeerId: senderId, isMine: 1 } as never);

            await handleChatAck(senderId, data, mockWin);

            expect(messagesOps.updateMessageStatus).toHaveBeenCalledWith(data.id, 'read');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-status-updated', {
                id: data.id,
                status: 'read'
            });
        });

        it('should not update if message is not mine', async () => {
            const data: ChatAckData = { id: '12345678-1234-1234-1234-123456789012', status: 'read' };
            vi.mocked(messagesOps.getMessageById).mockResolvedValue({ id: data.id, chatUpeerId: senderId, isMine: 0 } as never);

            await handleChatAck(senderId, data, mockWin);

            expect(messagesOps.updateMessageStatus).not.toHaveBeenCalled();
        });
    });

    describe('handleChatEdit', () => {
        it('should decrypt and update content if message is from the peer', async () => {
            const data: ChatEditData = {
                msgId: '12345678-1234-1234-1234-123456789012',
                content: 'aa',
                nonce: 'bb',
                ephemeralPublicKey: 'a'.repeat(64),
                version: 2,
            };
            vi.mocked(messagesOps.getMessageById).mockResolvedValue({ id: data.msgId, chatUpeerId: senderId, isMine: 0 } as never);
            const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'b'.repeat(64) } as never);
            vi.mocked(identity.decrypt).mockReturnValue(Buffer.from('editado'));

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
            const data: ChatEditData = {
                msgId: '12345678-1234-1234-1234-123456789012',
                content: 'aa',
                nonce: 'bb',
                version: 3,
            };
            vi.mocked(messagesOps.getMessageById).mockResolvedValue({ id: data.msgId, chatUpeerId: senderId, isMine: 0 } as never);
            const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
                publicKey: 'b'.repeat(64),
                ephemeralPublicKey: 'c'.repeat(64)
            } as never);
            vi.mocked(identity.decrypt).mockReturnValue(Buffer.from('editado 2'));

            await handleChatEdit(senderId, data, mockWin, 'edit-sig-2');

            expect(identity.decrypt).toHaveBeenCalledWith(
                Buffer.from(data.nonce, 'hex'),
                Buffer.from(data.content, 'hex'),
                Buffer.from('c'.repeat(64), 'hex')
            );
            expect(messagesOps.updateMessageContent).toHaveBeenCalledWith(data.msgId, 'editado 2', 'edit-sig-2', 3);
        });

        it('should fallback to identity-key decryption for vaulted static chat updates', async () => {
            const data: ChatEditData = {
                msgId: '12345678-1234-1234-1234-123456789012',
                content: 'aa',
                nonce: 'bb',
                version: 4,
                ephemeralPublicKey: 'a'.repeat(64),
                useRecipientEphemeral: false,
            };
            vi.mocked(messagesOps.getMessageById).mockResolvedValue({ id: data.msgId, chatUpeerId: senderId, isMine: 0 } as never);
            const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'b'.repeat(64) } as never);
            vi.mocked(identity.decrypt).mockReturnValue(null);
            vi.mocked(identity.decryptWithIdentityKey).mockReturnValue(Buffer.from('edit vaulted'));

            await handleChatEdit(senderId, data, mockWin, 'edit-sig-3');

            expect(identity.decryptWithIdentityKey).toHaveBeenCalledWith(
                Buffer.from(data.nonce, 'hex'),
                Buffer.from(data.content, 'hex'),
                Buffer.from(data.ephemeralPublicKey, 'hex')
            );
            expect(messagesOps.updateMessageContent).toHaveBeenCalledWith(data.msgId, 'edit vaulted', 'edit-sig-3', 4);
        });

        it('should apply self-synced edits to own messages', async () => {
            const myId = 'my-peer-id';
            const data: ChatEditData = {
                msgId: '12345678-1234-1234-1234-123456789012',
                content: 'edit local sync',
                chatUpeerId: 'peer-chat',
                version: 5,
                isInternalSync: true,
            };
            vi.mocked(identity.getMyUPeerId).mockReturnValue(myId);
            vi.mocked(messagesOps.getMessageById).mockResolvedValue({ id: data.msgId, chatUpeerId: 'peer-chat', isMine: 1 } as never);

            await handleChatEdit(myId, data, mockWin, 'edit-self-sig');

            expect(messagesOps.updateMessageContent).toHaveBeenCalledWith(data.msgId, 'edit local sync', 'edit-self-sig', 5);
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-updated', expect.objectContaining({
                id: data.msgId,
                chatUpeerId: 'peer-chat',
                content: 'edit local sync'
            }));
        });
    });

    describe('handleChatDelete', () => {
        it('should delete locally if message is from the peer', async () => {
            const data: ChatDeleteData = { msgId: '12345678-1234-1234-1234-123456789012', timestamp: 1234 };
            vi.mocked(messagesOps.getMessageById).mockResolvedValue({ id: data.msgId, chatUpeerId: senderId, isMine: 0 } as never);

            await handleChatDelete(senderId, data, mockWin);

            expect(messagesOps.deleteMessageLocally).toHaveBeenCalledWith(data.msgId, data.timestamp);
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-deleted', { id: data.msgId, upeerId: senderId, chatUpeerId: senderId });
        });

        it('should cleanup local attachment data for deleted file messages', async () => {
            const cleanup = await import('../../../src/main_process/utils/localAttachmentCleanup.js');
            const { fileTransferManager } = await import('../../../src/main_process/network/file-transfer/transfer-manager.js');
            const data: ChatDeleteData = { msgId: '12345678-1234-1234-1234-123456789012', timestamp: 1234 };
            vi.mocked(messagesOps.getMessageById).mockResolvedValue({
                id: data.msgId,
                chatUpeerId: senderId,
                isMine: 0,
                message: JSON.stringify({ type: 'file', fileId: 'file-1', savedPath: '/tmp/upeer/file-1.bin' })
            } as never);
            vi.mocked(cleanup.extractLocalAttachmentInfo).mockReturnValue({ fileId: 'file-1', filePath: '/tmp/upeer/file-1.bin' });

            await handleChatDelete(senderId, data, mockWin);

            expect(fileTransferManager.cancelTransfer).toHaveBeenCalledWith('file-1', 'message deleted');
            expect(cleanup.cleanupLocalAttachmentFile).toHaveBeenCalledWith('/tmp/upeer/file-1.bin');
        });

        it('should apply self-synced deletes to own messages', async () => {
            const myId = 'my-peer-id';
            const data: ChatDeleteData = { msgId: '12345678-1234-1234-1234-123456789012', timestamp: 5555, chatUpeerId: 'peer-chat', isInternalSync: true };
            vi.mocked(identity.getMyUPeerId).mockReturnValue(myId);
            vi.mocked(messagesOps.getMessageById).mockResolvedValue({ id: data.msgId, chatUpeerId: 'peer-chat', isMine: 1, message: 'hola' } as never);

            await handleChatDelete(myId, data, mockWin);

            expect(messagesOps.deleteMessageLocally).toHaveBeenCalledWith(data.msgId, data.timestamp);
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-deleted', { id: data.msgId, upeerId: myId, chatUpeerId: 'peer-chat' });
        });
    });

    describe('handleChatClear', () => {
        it('should clear the explicit chat context for self-sync packets', async () => {
            const data: ChatClearData = { chatUpeerId: 'peer-chat', timestamp: 9999 };

            await handleChatClear('my-peer-id', data, mockWin);

            expect(messagesOps.deleteMessagesByChatId).toHaveBeenCalledWith('peer-chat', 9999);
            expect(mockWin.webContents.send).toHaveBeenCalledWith('chat-cleared', { upeerId: 'peer-chat' });
        });
    });

    describe('handleChatReaction', () => {
        it('should save reaction and notify UI', async () => {
            const data: ChatReactionData = { id: '12345678-1234-1234-1234-123456789012', reaction: '👍' };

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
            const data: ChatReactionData = { id: '12345678-1234-1234-1234-123456789012', emojiToDelete: '👍' };

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

        it('should preserve group chat context when processing a group reaction', async () => {
            const data: ChatReactionData = {
                id: '12345678-1234-1234-1234-123456789012',
                reaction: '🔥',
                chatUpeerId: 'grp-1'
            };

            await handleChatReaction(senderId, data, mockWin);

            expect(reactionsOps.saveReaction).toHaveBeenCalledWith(data.id, senderId, '🔥');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-reaction-updated', {
                msgId: data.id,
                upeerId: senderId,
                chatUpeerId: 'grp-1',
                emoji: '🔥',
                remove: false
            });
        });
    });

    describe('handleChatClear', () => {
        it('should clear messages for a chat ID', async () => {
            const data: ChatClearData = { clearTimestamp: 1000 };
            await handleChatClear(senderId, data, mockWin);

            // En chat.ts se usa un import dinámico. Como tenemos mockeado el módulo,
            // podemos verificar la llamada en el objeto mockeado.
            expect(messagesOps.deleteMessagesByChatId).toHaveBeenCalledWith(senderId, 1000);
            expect(mockWin.webContents.send).toHaveBeenCalledWith('chat-cleared', { upeerId: senderId });
        });

        it('should accept timestamp payloads for chat clear sync', async () => {
            const data: ChatClearData = { timestamp: 2000 };
            await handleChatClear(senderId, data, mockWin);

            expect(messagesOps.deleteMessagesByChatId).toHaveBeenCalledWith(senderId, 2000);
            expect(mockWin.webContents.send).toHaveBeenCalledWith('chat-cleared', { upeerId: senderId });
        });
    });

    describe('handleReadReceipt', () => {
        it('should update message status to read', async () => {
            const data: ReadReceiptData = { id: '12345678-1234-1234-1234-123456789012' };
            await handleReadReceipt(senderId, data, mockWin);

            expect(messagesOps.updateMessageStatus).toHaveBeenCalledWith(data.id, 'read');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-status-updated', expect.objectContaining({
                id: data.id,
                status: 'read'
            }));
        });
    });
});
