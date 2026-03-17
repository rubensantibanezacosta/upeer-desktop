import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChatMessage, handleChatAck, handleChatEdit, handleChatDelete, handleChatReaction } from '../../../src/main_process/network/handlers/chat.js';
import * as db from '../../../src/main_process/storage/db.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as reputation from '../../../src/main_process/security/reputation/vouches.js';

// Mock de dependencias
vi.mock('../../../src/main_process/storage/db.js', () => ({
    updateContactEphemeralPublicKey: vi.fn(),
    saveMessage: vi.fn(),
    updateMessageStatus: vi.fn(),
    updateMessageContent: vi.fn(),
    deleteMessageLocally: vi.fn(),
    saveReaction: vi.fn(),
    deleteReaction: vi.fn(),
    getMessageById: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    decrypt: vi.fn(),
    getMyUPeerId: vi.fn(() => 'my-peer-id'),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    issueVouch: vi.fn(async () => { }),
    VouchType: { HANDSHAKE: 'HANDSHAKE' }
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

    describe('handleChatMessage', () => {
        it('should process a simple unencrypted message', async () => {
            const data = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'hola p2p',
                timestamp: Date.now()
            };

            (db.saveMessage as any).mockResolvedValue({ changes: 1 });
            (db.getMessageById as any).mockResolvedValue(null);

            await handleChatMessage(senderId, mockContact, data, mockWin, 'sig', '1.2.3.4', mockSendResponse);

            expect(db.saveMessage).toHaveBeenCalledWith(
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
                id: data.id
            }));

            expect(mockSendResponse).toHaveBeenCalledWith('1.2.3.4', expect.objectContaining({
                type: 'CHAT_ACK',
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
            (db.saveMessage as any).mockResolvedValue({ changes: 1 });

            await handleChatMessage(senderId, mockContact, data, mockWin, 'sig', '1.2.3.4', mockSendResponse);

            expect(identity.decrypt).toHaveBeenCalled();
            expect(db.saveMessage).toHaveBeenCalledWith(
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

        it('should handle decryption failure gracefully', async () => {
            const data = {
                id: '12345678-1234-1234-1234-123456789012',
                content: 'bad-data',
                nonce: 'nonce'
            };

            (identity.decrypt as any).mockReturnValue(null);
            (db.saveMessage as any).mockResolvedValue({ changes: 1 });

            await handleChatMessage(senderId, mockContact, data, mockWin, 'sig', '1.2.3.4', mockSendResponse);

            expect(db.saveMessage).toHaveBeenCalledWith(
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

            (db.getMessageById as any).mockResolvedValue({ id: data.id });

            await handleChatMessage(senderId, mockContact, data, mockWin, 'sig', '1.2.3.4', mockSendResponse);

            expect(db.saveMessage).not.toHaveBeenCalled();
            expect(mockSendResponse).toHaveBeenCalledWith('1.2.3.4', expect.objectContaining({
                type: 'CHAT_ACK',
                status: 'delivered'
            }));
        });
    });

    describe('handleChatAck', () => {
        it('should update message status if it is mine', async () => {
            const data = { id: '12345678-1234-1234-1234-123456789012', status: 'read' };
            (db.getMessageById as any).mockResolvedValue({ id: data.id, chatUpeerId: senderId, isMine: 1 });

            await handleChatAck(senderId, data, mockWin);

            expect(db.updateMessageStatus).toHaveBeenCalledWith(data.id, 'read');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-status-updated', {
                id: data.id,
                status: 'read'
            });
        });

        it('should not update if message is not mine', async () => {
            const data = { id: '12345678-1234-1234-1234-123456789012', status: 'read' };
            (db.getMessageById as any).mockResolvedValue({ id: data.id, chatUpeerId: senderId, isMine: 0 });

            await handleChatAck(senderId, data, mockWin);

            expect(db.updateMessageStatus).not.toHaveBeenCalled();
        });
    });

    describe('handleChatEdit', () => {
        it('should update content if message is from the peer', async () => {
            const data = { id: '12345678-1234-1234-1234-123456789012', newContent: 'editado' };
            (db.getMessageById as any).mockResolvedValue({ id: data.id, chatUpeerId: senderId, isMine: 0 });

            await handleChatEdit(senderId, data, mockWin, 'edit-sig');

            expect(db.updateMessageContent).toHaveBeenCalledWith(data.id, 'editado', 'edit-sig');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-edited', {
                id: data.id,
                newContent: 'editado'
            });
        });
    });

    describe('handleChatDelete', () => {
        it('should delete locally if message is from the peer', async () => {
            const data = { id: '12345678-1234-1234-1234-123456789012' };
            (db.getMessageById as any).mockResolvedValue({ id: data.id, chatUpeerId: senderId, isMine: 0 });

            await handleChatDelete(senderId, data, mockWin);

            expect(db.deleteMessageLocally).toHaveBeenCalledWith(data.id);
            expect(mockWin.webContents.send).toHaveBeenCalledWith('message-deleted', { id: data.id });
        });
    });

    describe('handleChatReaction', () => {
        it('should save reaction and notify UI', async () => {
            const data = { id: '12345678-1234-1234-1234-123456789012', reaction: '👍' };

            await handleChatReaction(senderId, data, mockWin);

            expect(db.saveReaction).toHaveBeenCalledWith(data.id, senderId, '👍');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('reaction-added', {
                messageId: data.id,
                upeerId: senderId,
                reaction: '👍'
            });
        });

        it('should delete reaction if emojiToDelete is provided', async () => {
            const data = { id: '12345678-1234-1234-1234-123456789012', emojiToDelete: '👍' };

            await handleChatReaction(senderId, data, mockWin);

            expect(db.deleteReaction).toHaveBeenCalledWith(data.id, senderId, '👍');
            expect(mockWin.webContents.send).toHaveBeenCalledWith('reaction-removed', {
                messageId: data.id,
                upeerId: senderId,
                reaction: '👍'
            });
        });
    });
});
