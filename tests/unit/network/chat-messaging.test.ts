import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as contactsOpsModule from '../../../src/main_process/storage/contacts/operations.js';
import * as groupsOpsModule from '../../../src/main_process/storage/groups/operations.js';
import * as messagesOpsModule from '../../../src/main_process/storage/messages/operations.js';
import * as messageStatusModule from '../../../src/main_process/storage/messages/status.js';
import * as identityModule from '../../../src/main_process/security/identity.js';

type ContactRecord = NonNullable<Awaited<ReturnType<typeof contactsOpsModule.getContactByUpeerId>>>;
type GroupRecord = NonNullable<ReturnType<typeof groupsOpsModule.getGroupById>>;
type SaveMessageResult = Awaited<ReturnType<typeof messagesOpsModule.saveMessage>>;
type MessageRecord = Awaited<ReturnType<typeof messagesOpsModule.getMessageById>>;
type EncryptResult = ReturnType<typeof identityModule.encrypt>;
type MessageStatus = ReturnType<typeof messageStatusModule.getMessageStatus>;
type KademliaNode = { upeerId: string; address: string };
type KademliaInstance = { findClosestContacts: (upeerId: string, limit: number) => KademliaNode[] };

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
    getContacts: vi.fn(() => []),
}));

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    getGroupById: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveMessage: vi.fn(),
    updateMessageStatus: vi.fn(),
    updateMessageContent: vi.fn(),
    deleteMessageLocally: vi.fn(),
    getMessageById: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/status.js', () => ({
    getMessageStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/reactions.js', () => ({
    saveReaction: vi.fn(),
    deleteReaction: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyPublicKeyHex: vi.fn(() => '11'.repeat(32)),
    getMyUPeerId: vi.fn(() => 'self-id'),
    sign: vi.fn(() => Buffer.from('sig')),
    encrypt: vi.fn(() => ({ ciphertext: 'ciphertext', nonce: 'nonce' })),
    getMyEphemeralPublicKeyHex: vi.fn(() => '22'.repeat(32)),
    incrementEphemeralMessageCounter: vi.fn(),
    getMyIdentitySkBuffer: vi.fn(() => Buffer.alloc(32)),
    getMyPublicKey: vi.fn(() => Buffer.from('11'.repeat(32), 'hex')),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
    error: vi.fn(),
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    canonicalStringify: vi.fn((data) => JSON.stringify(data)),
}));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/core.js', () => ({
    startDhtSearch: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/handlers.js', () => ({
    getKademliaInstance: vi.fn(),
}));

vi.mock('../../../src/main_process/network/og-fetcher.js', () => ({
    fetchOgPreview: vi.fn(),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        replicateToVaults: vi.fn(),
    },
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

vi.mock('electron', () => ({
    BrowserWindow: {
        getAllWindows: vi.fn(() => [{ webContents: { send: vi.fn() } }]),
    },
}));

vi.mock('../../../src/main_process/sidecars/yggstack.js', () => ({
    getYggstackAddress: vi.fn(() => '200::self'),
}));

describe('network/messaging/chat.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it('vaults immediately when contact is known but disconnected', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { startDhtSearch } = await import('../../../src/main_process/network/dht/core.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-offline',
            status: 'disconnected',
            publicKey: 'aa'.repeat(32),
            address: '200::2',
        } as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(messagesOps.updateMessageStatus).mockResolvedValue(true);
        vi.mocked(VaultManager.replicateToVaults).mockResolvedValue(1);

        const result = await sendUDPMessage('peer-offline', 'hola offline', 'reply-1');

        expect(result).toEqual(expect.objectContaining({ savedMessage: 'hola offline' }));
        expect(messagesOps.saveMessage).toHaveBeenCalledWith(
            expect.any(String),
            'peer-offline',
            true,
            'hola offline',
            'reply-1',
            '',
            'sent',
            'self-id',
            expect.any(Number)
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-offline',
            expect.objectContaining({
                type: 'CHAT',
                content: 'ciphertext',
                nonce: 'nonce',
                timestamp: expect.any(Number),
                ephemeralPublicKey: '22'.repeat(32),
                useRecipientEphemeral: false,
                replyTo: 'reply-1',
                senderUpeerId: 'self-id',
                signature: Buffer.from('sig').toString('hex')
            })
        );
        expect(messagesOps.updateMessageStatus).toHaveBeenCalledWith(expect.any(String), 'vaulted');
        expect(startDhtSearch).toHaveBeenCalledWith('peer-offline', expect.any(Function));
    });

    it('uses the serialized preview payload for offline vault delivery', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-offline',
            status: 'disconnected',
            publicKey: 'aa'.repeat(32),
            address: '200::2',
        } as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(messagesOps.updateMessageStatus).mockResolvedValue(true);
        vi.mocked(VaultManager.replicateToVaults).mockResolvedValue(1);

        const preview = { url: 'https://example.com', title: 'Example' };
        const expectedPayload = JSON.stringify({ text: 'hola https://example.com', linkPreview: preview });

        const result = await sendUDPMessage('peer-offline', {
            content: 'hola https://example.com',
            linkPreview: preview,
        }, 'reply-1');

        expect(result).toEqual(expect.objectContaining({ savedMessage: expectedPayload }));
        expect(messagesOps.saveMessage).toHaveBeenCalledWith(
            expect.any(String),
            'peer-offline',
            true,
            expectedPayload,
            'reply-1',
            '',
            'sent',
            'self-id',
            expect.any(Number)
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-offline',
            expect.objectContaining({
                type: 'CHAT',
                content: 'ciphertext',
                nonce: 'nonce',
                replyTo: 'reply-1',
                senderUpeerId: 'self-id',
            })
        );
    });

    it('marks offline messages as failed when vault replication has no custodians', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-offline',
            status: 'disconnected',
            publicKey: 'aa'.repeat(32),
            address: '200::2',
        } as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(messagesOps.updateMessageStatus).mockResolvedValue(true);
        vi.mocked(VaultManager.replicateToVaults).mockResolvedValue(0);

        const result = await sendUDPMessage('peer-offline', 'sin custodios');

        expect(result).toBeDefined();
        expect(messagesOps.updateMessageStatus).toHaveBeenCalledWith(result!.id, 'failed');
    });

    it('encrypts legacy chat fallback to the recipient identity key even when ephemeral is available', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const identity = await import('../../../src/main_process/security/identity.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            ephemeralPublicKey: 'bb'.repeat(32),
            ephemeralPublicKeyUpdatedAt: new Date().toISOString(),
            address: '200::9',
            knownAddresses: '[]'
        } as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(identity.encrypt).mockReturnValue({ ciphertext: 'ciphertext', nonce: 'nonce' } as EncryptResult);

        await sendUDPMessage('peer-online', 'hola legacy');

        expect(identity.encrypt).toHaveBeenCalledWith(
            Buffer.from('hola legacy', 'utf-8'),
            Buffer.from('aa'.repeat(32), 'hex')
        );
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::9',
            expect.objectContaining({
                type: 'CHAT',
                useRecipientEphemeral: false,
                ephemeralPublicKey: '22'.repeat(32),
            }),
            'aa'.repeat(32),
            false
        );
    });

    it('drops imageBase64 from previews that would exceed online chat validation limits', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const identity = await import('../../../src/main_process/security/identity.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            address: '200::9',
            knownAddresses: '[]'
        } as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(identity.encrypt).mockReturnValue({ ciphertext: 'ciphertext', nonce: 'nonce' } as EncryptResult);

        const preview = {
            url: 'https://example.com',
            title: 'Example',
            description: 'Preview',
            domain: 'example.com',
            imageBase64: `data:image/jpeg;base64,${'a'.repeat(120_000)}`,
        };

        const result = await sendUDPMessage('peer-online', {
            content: 'mira https://example.com',
            linkPreview: preview,
        });

        const expectedPayload = JSON.stringify({
            text: 'mira https://example.com',
            linkPreview: {
                url: 'https://example.com',
                title: 'Example',
                description: 'Preview',
                domain: 'example.com',
            }
        });

        expect(result).toEqual(expect.objectContaining({ savedMessage: expectedPayload }));
        expect(messagesOps.saveMessage).toHaveBeenCalledWith(
            expect.any(String),
            'peer-online',
            true,
            expectedPayload,
            undefined,
            expect.any(String),
            'sent',
            'self-id',
            expect.any(Number)
        );
    });

    it('uses recipient identity key for chat updates even when ephemeral is available', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const identity = await import('../../../src/main_process/security/identity.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendChatUpdate } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            ephemeralPublicKey: 'bb'.repeat(32),
            address: '200::9',
        } as ContactRecord);
        vi.mocked(messagesOps.getMessageById).mockResolvedValue(null);

        vi.mocked(identity.encrypt).mockReturnValue({ ciphertext: 'ciphertext', nonce: 'nonce' } as EncryptResult);

        await sendChatUpdate('peer-online', '12345678-1234-1234-1234-123456789012', 'mensaje editado');

        expect(identity.encrypt).toHaveBeenCalledWith(
            Buffer.from('mensaje editado', 'utf-8'),
            Buffer.from('aa'.repeat(32), 'hex')
        );
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::9',
            expect.objectContaining({
                type: 'CHAT_UPDATE',
                useRecipientEphemeral: false,
                ephemeralPublicKey: '22'.repeat(32),
            }),
            'aa'.repeat(32)
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-online',
            expect.objectContaining({
                type: 'CHAT_UPDATE',
                useRecipientEphemeral: false,
            })
        );
        expect(messagesOps.updateMessageContent).toHaveBeenCalledWith(
            '12345678-1234-1234-1234-123456789012',
            'mensaje editado',
            Buffer.from('sig').toString('hex'),
            1
        );
    });

    it('serializes a provided link preview in chat updates', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const identity = await import('../../../src/main_process/security/identity.js');
        const { fetchOgPreview } = await import('../../../src/main_process/network/og-fetcher.js');
        const { sendChatUpdate } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            ephemeralPublicKey: 'bb'.repeat(32),
            address: '200::9',
            knownAddresses: '[]'
        } as ContactRecord);
        vi.mocked(messagesOps.getMessageById).mockResolvedValue({ version: 0 } as NonNullable<MessageRecord>);
        vi.mocked(identity.encrypt).mockReturnValue({ ciphertext: 'ciphertext', nonce: 'nonce' } as EncryptResult);

        const preview = { url: 'https://example.com', title: 'Example' };
        await sendChatUpdate('peer-online', '12345678-1234-1234-1234-123456789012', 'hola https://example.com', preview);

        expect(fetchOgPreview).not.toHaveBeenCalled();
        expect(messagesOps.updateMessageContent).toHaveBeenCalledWith(
            '12345678-1234-1234-1234-123456789012',
            JSON.stringify({ text: 'hola https://example.com', linkPreview: preview }),
            Buffer.from('sig').toString('hex'),
            1
        );
        expect(identity.encrypt).toHaveBeenCalledWith(
            Buffer.from(JSON.stringify({ text: 'hola https://example.com', linkPreview: preview }), 'utf-8'),
            Buffer.from('aa'.repeat(32), 'hex')
        );
    });

    it('serializes a provided link preview without refetching it', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { fetchOgPreview } = await import('../../../src/main_process/network/og-fetcher.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            address: '200::9',
            knownAddresses: '[]'
        } as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);

        const preview = {
            url: 'https://example.com',
            title: 'Example',
            description: 'Preview',
            domain: 'example.com'
        };

        const result = await sendUDPMessage('peer-online', {
            content: 'mira https://example.com',
            linkPreview: preview,
        });

        expect(fetchOgPreview).not.toHaveBeenCalled();
        expect(result).toEqual(expect.objectContaining({
            savedMessage: JSON.stringify({ text: 'mira https://example.com', linkPreview: preview })
        }));
        expect(messagesOps.saveMessage).toHaveBeenCalledWith(
            expect.any(String),
            'peer-online',
            true,
            JSON.stringify({ text: 'mira https://example.com', linkPreview: preview }),
            undefined,
            expect.any(String),
            'sent',
            'self-id',
            expect.any(Number)
        );
    });

    it('synchronizes a normal chat message to another own device in real time', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/handlers.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            address: '200::10',
            knownAddresses: '[]'
        } as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(getKademliaInstance).mockReturnValue({
            findClosestContacts: vi.fn(() => [
                { upeerId: 'self-id', address: '200::other-device' },
                { upeerId: 'self-id', address: '200::self' }
            ])
        } as KademliaInstance);

        await sendUDPMessage('peer-online', 'hola sync');

        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::10',
            expect.objectContaining({
                type: 'CHAT',
                replyTo: undefined,
                useRecipientEphemeral: false,
                ephemeralPublicKey: '22'.repeat(32)
            }),
            'aa'.repeat(32),
            false
        );
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::other-device',
            expect.objectContaining({
                type: 'CHAT',
                replyTo: undefined,
                useRecipientEphemeral: false,
                ephemeralPublicKey: '22'.repeat(32)
            }),
            '11'.repeat(32),
            true
        );
    });

    it('vaults a normal chat message for self-sync when no other own device is reachable', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/handlers.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            address: '200::10',
            knownAddresses: '[]'
        } as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(getKademliaInstance).mockReturnValue({
            findClosestContacts: vi.fn(() => [])
        } as KademliaInstance);

        await sendUDPMessage('peer-online', 'hola vault sync');
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'self-id',
            expect.objectContaining({
                type: 'CHAT',
                senderUpeerId: 'self-id',
                useRecipientEphemeral: false,
                signature: Buffer.from('sig').toString('hex')
            })
        );
    });

    it('marks connected messages as failed after ack timeout when vault fallback also fails', async () => {
        vi.useFakeTimers();

        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const messageStatus = await import('../../../src/main_process/storage/messages/status.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            address: '200::9',
            knownAddresses: '[]'
        } as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(messagesOps.updateMessageStatus).mockResolvedValue(true);
        vi.mocked(messageStatus.getMessageStatus).mockReturnValue('sent' as MessageStatus);
        vi.mocked(VaultManager.replicateToVaults).mockResolvedValue(0);

        const result = await sendUDPMessage('peer-online', 'sin ack');

        await vi.advanceTimersByTimeAsync(2600);

        expect(result).toBeDefined();
        expect(messagesOps.updateMessageStatus).toHaveBeenCalledWith(result!.id, 'failed');
    });

    it('cleans local attachment data when deleting a file message', async () => {
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const cleanup = await import('../../../src/main_process/utils/localAttachmentCleanup.js');
        const { fileTransferManager } = await import('../../../src/main_process/network/file-transfer/transfer-manager.js');
        const { sendChatDelete } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(messagesOps.getMessageById).mockResolvedValue({
            id: 'file-1',
            message: JSON.stringify({ type: 'file', fileId: 'file-1', filePath: '/tmp/upeer/file-1.bin' })
        } as NonNullable<MessageRecord>);
        vi.mocked(cleanup.extractLocalAttachmentInfo).mockReturnValue({
            fileId: 'file-1',
            filePath: '/tmp/upeer/file-1.bin'
        });

        await sendChatDelete('peer-online', 'file-1');

        expect(fileTransferManager.cancelTransfer).toHaveBeenCalledWith('file-1', 'message deleted');
        expect(cleanup.cleanupLocalAttachmentFile).toHaveBeenCalledWith('/tmp/upeer/file-1.bin');
        expect(messagesOps.deleteMessageLocally).toHaveBeenCalledWith('file-1');
    });

    it('fans out group reactions with group context to online, offline, and self devices', async () => {
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const reactionsOps = await import('../../../src/main_process/storage/messages/reactions.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/handlers.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendChatReaction } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-1',
            status: 'active',
            members: ['self-id', 'peer-online', 'peer-offline']
        } as GroupRecord);
        vi.mocked(contactsOps.getContactByUpeerId).mockImplementation(async (upeerId: string) => {
            if (upeerId === 'peer-online') {
                return {
                    upeerId,
                    status: 'connected',
                    publicKey: 'aa'.repeat(32),
                    address: '200::10',
                    knownAddresses: '[]'
                } as ContactRecord;
            }

            if (upeerId === 'peer-offline') {
                return {
                    upeerId,
                    status: 'disconnected',
                    publicKey: 'bb'.repeat(32),
                    address: '200::20',
                    knownAddresses: '[]'
                } as ContactRecord;
            }

            return null;
        });
        vi.mocked(getKademliaInstance).mockReturnValue({
            findClosestContacts: vi.fn(() => [
                { upeerId: 'self-id', address: '200::other-device' },
                { upeerId: 'self-id', address: '200::self' }
            ])
        } as KademliaInstance);

        await sendChatReaction('grp-1', '12345678-1234-1234-1234-123456789012', '🔥', false);

        expect(reactionsOps.saveReaction).toHaveBeenCalledWith('12345678-1234-1234-1234-123456789012', 'self-id', '🔥');
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::10',
            expect.objectContaining({
                type: 'CHAT_REACTION',
                msgId: '12345678-1234-1234-1234-123456789012',
                emoji: '🔥',
                chatUpeerId: 'grp-1',
                senderUpeerId: 'self-id',
                signature: Buffer.from('sig').toString('hex')
            }),
            'aa'.repeat(32)
        );
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::other-device',
            expect.objectContaining({
                type: 'CHAT_REACTION',
                chatUpeerId: 'grp-1',
                senderUpeerId: 'self-id'
            }),
            '11'.repeat(32),
            true
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-offline',
            expect.objectContaining({
                type: 'CHAT_REACTION',
                chatUpeerId: 'grp-1',
                senderUpeerId: 'self-id'
            })
        );
    });
});