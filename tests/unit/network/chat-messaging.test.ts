import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as contactsOpsModule from '../../../src/main_process/storage/contacts/operations.js';
import * as groupsOpsModule from '../../../src/main_process/storage/groups/operations.js';
import * as messagesOpsModule from '../../../src/main_process/storage/messages/operations.js';
import * as messageStatusModule from '../../../src/main_process/storage/messages/status.js';

type ContactRecord = NonNullable<Awaited<ReturnType<typeof contactsOpsModule.getContactByUpeerId>>>;
type GroupRecord = NonNullable<ReturnType<typeof groupsOpsModule.getGroupById>>;
type SaveMessageResult = Awaited<ReturnType<typeof messagesOpsModule.saveMessage>>;
type MessageRecord = Awaited<ReturnType<typeof messagesOpsModule.getMessageById>>;
type MessageStatus = ReturnType<typeof messageStatusModule.getMessageStatus>;
type KademliaInstance = import('../../../src/main_process/network/dht/kademlia/main.js').KademliaDHT;

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

vi.mock('../../../src/main_process/storage/ratchet/operations.js', () => ({
    getRatchetSession: vi.fn(() => null),
    saveRatchetSession: vi.fn(),
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
    getMySignedPreKey: vi.fn(() => ({ spkPub: '55'.repeat(32), spkSig: '66'.repeat(64), spkId: 13 })),
    getMyPublicKey: vi.fn(() => Buffer.from('11'.repeat(32), 'hex')),
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
    beforeEach(async () => {
        vi.clearAllMocks();
        vi.useRealTimers();
        const { resetPendingDirectMessages } = await import('../../../src/main_process/network/messaging/chatRetry.js');
        resetPendingDirectMessages();
        const { resetEncryptedOperationRetries } = await import('../../../src/main_process/network/messaging/encryptedOperationRetry.js');
        resetEncryptedOperationRetries();
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
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 7,
            address: '200::2',
        } as unknown as ContactRecord);
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
                content: 'ratchet-cipher',
                nonce: 'ratchet-nonce',
                timestamp: expect.any(Number),
                ratchetHeader: { dh: '44'.repeat(32), pn: 0, n: 0 },
                x3dhInit: {
                    ekPub: '33'.repeat(32),
                    spkId: 7,
                    ikPub: '11'.repeat(32),
                },
                replyTo: 'reply-1',
                senderUpeerId: 'self-id',
                signature: Buffer.from('sig').toString('hex')
            })
        );
        expect(messagesOps.updateMessageStatus).toHaveBeenCalledWith(expect.any(String), 'vaulted');
        expect(startDhtSearch).toHaveBeenCalledWith('peer-offline', expect.any(Function));
    });

    it('uses Double Ratchet for new offline vaulted messages when the contact already has signedPreKey', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { saveRatchetSession } = await import('../../../src/main_process/storage/ratchet/operations.js');
        const ratchet = await import('../../../src/main_process/security/ratchet.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-offline-dr',
            status: 'disconnected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 42,
            address: '200::22',
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(messagesOps.updateMessageStatus).mockResolvedValue(true);
        vi.mocked(VaultManager.replicateToVaults).mockResolvedValue(1);

        await sendUDPMessage('peer-offline-dr', 'hola offline dr');

        expect(ratchet.x3dhInitiator).toHaveBeenCalled();
        expect(ratchet.ratchetEncrypt).toHaveBeenCalled();
        expect(saveRatchetSession).toHaveBeenCalled();
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-offline-dr',
            expect.objectContaining({
                type: 'CHAT',
                content: 'ratchet-cipher',
                nonce: 'ratchet-nonce',
                ratchetHeader: { dh: '44'.repeat(32), pn: 0, n: 0 },
                x3dhInit: {
                    ekPub: '33'.repeat(32),
                    spkId: 42,
                    ikPub: '11'.repeat(32),
                },
                senderUpeerId: 'self-id',
            })
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-offline-dr',
            expect.not.objectContaining({ ephemeralPublicKey: expect.anything() })
        );
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
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 8,
            address: '200::2',
        } as unknown as ContactRecord);
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
                content: 'ratchet-cipher',
                nonce: 'ratchet-nonce',
                ratchetHeader: { dh: '44'.repeat(32), pn: 0, n: 0 },
                x3dhInit: {
                    ekPub: '33'.repeat(32),
                    spkId: 8,
                    ikPub: '11'.repeat(32),
                },
                replyTo: 'reply-1',
                senderUpeerId: 'self-id',
            })
        );
    });

    it('sends contact cards through the normal chat pipeline so offline peers get vault delivery too', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendContactCard } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-contact-card',
            status: 'disconnected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 7,
            address: '200::77',
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(messagesOps.updateMessageStatus).mockResolvedValue(true);
        vi.mocked(VaultManager.replicateToVaults).mockResolvedValue(1);

        const msgId = await sendContactCard('peer-contact-card', {
            name: 'Alice',
            address: '300::1',
            upeerId: 'peer-alice',
            publicKey: 'cc'.repeat(32),
        });

        expect(msgId).toEqual(expect.any(String));
        expect(messagesOps.saveMessage).toHaveBeenCalledWith(
            expect.any(String),
            'peer-contact-card',
            true,
            JSON.stringify({
                type: 'contact_card',
                text: '',
                contact: {
                    name: 'Alice',
                    address: '300::1',
                    upeerId: 'peer-alice',
                    publicKey: 'cc'.repeat(32),
                    avatar: undefined,
                },
            }),
            undefined,
            '',
            'sent',
            'self-id',
            expect.any(Number)
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-contact-card',
            expect.objectContaining({
                type: 'CHAT',
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
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 9,
            address: '200::2',
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(messagesOps.updateMessageStatus).mockResolvedValue(true);
        vi.mocked(VaultManager.replicateToVaults).mockResolvedValue(0);

        const result = await sendUDPMessage('peer-offline', 'sin custodios');

        expect(result).toBeDefined();
        if (!result) return;
        expect(messagesOps.updateMessageStatus).toHaveBeenCalledWith(result.id, 'failed');
    });

    it('fails fast when a connected contact lacks Double Ratchet bootstrap material', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            ephemeralPublicKey: 'bb'.repeat(32),
            ephemeralPublicKeyUpdatedAt: new Date().toISOString(),
            address: '200::9',
            knownAddresses: '[]'
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);

        await expect(sendUDPMessage('peer-online', 'hola legacy')).rejects.toThrow('missing-signed-prekey');
    });

    it('retries pending connected direct messages after DR_RESET with the same id', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { registerPendingDirectMessage, retryPendingDirectMessages } = await import('../../../src/main_process/network/messaging/chatRetry.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 10,
            address: '200::9',
            knownAddresses: JSON.stringify(['200::10'])
        } as unknown as ContactRecord);

        registerPendingDirectMessage({
            messageId: '12345678-1234-1234-1234-123456789012',
            upeerId: 'peer-online',
            payload: 'hola retry',
            knownAddresses: ['200::10'],
            timestamp: Date.now(),
        });

        const retried = await retryPendingDirectMessages('peer-online');

        expect(retried).toBe(1);
        expect(sendSecureUDPMessage).toHaveBeenNthCalledWith(
            1,
            '200::9',
            expect.objectContaining({ id: '12345678-1234-1234-1234-123456789012', type: 'CHAT' }),
            'aa'.repeat(32),
            false
        );
        expect(sendSecureUDPMessage).toHaveBeenNthCalledWith(
            2,
            '200::10',
            expect.objectContaining({ id: '12345678-1234-1234-1234-123456789012', type: 'CHAT' }),
            'aa'.repeat(32),
            false
        );
    });

    it('drops imageBase64 from previews that would exceed online chat validation limits', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 11,
            address: '200::9',
            knownAddresses: '[]'
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);

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
        const { saveRatchetSession } = await import('../../../src/main_process/storage/ratchet/operations.js');
        const ratchet = await import('../../../src/main_process/security/ratchet.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { sendChatUpdate } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 7,
            address: '200::9',
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.getMessageById).mockResolvedValue(undefined);

        await sendChatUpdate('peer-online', '12345678-1234-1234-1234-123456789012', 'mensaje editado');

        expect(ratchet.x3dhInitiator).toHaveBeenCalled();
        expect(ratchet.ratchetEncrypt).toHaveBeenCalled();
        expect(saveRatchetSession).toHaveBeenCalled();
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::9',
            expect.objectContaining({
                type: 'CHAT_UPDATE',
                ratchetHeader: { dh: '44'.repeat(32), pn: 0, n: 0 },
                x3dhInit: {
                    ekPub: '33'.repeat(32),
                    spkId: 7,
                    ikPub: '11'.repeat(32),
                },
            }),
            'aa'.repeat(32)
        );
        expect(messagesOps.updateMessageContent).toHaveBeenCalledWith(
            '12345678-1234-1234-1234-123456789012',
            'mensaje editado',
            Buffer.from('sig').toString('hex'),
            1
        );
    });

    it('retries pending encrypted chat updates after DR_RESET', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { retryPendingEncryptedOperations } = await import('../../../src/main_process/network/messaging/encryptedOperationRetry.js');
        const { sendChatUpdate } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 7,
            address: '200::9',
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.getMessageById).mockResolvedValue(undefined);

        await sendChatUpdate('peer-online', '12345678-1234-1234-1234-123456789012', 'mensaje editado');

        vi.mocked(sendSecureUDPMessage).mockClear();

        const retried = await retryPendingEncryptedOperations('peer-online');

        expect(retried).toBe(1);
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::9',
            expect.objectContaining({
                type: 'CHAT_UPDATE',
                msgId: '12345678-1234-1234-1234-123456789012',
            }),
            'aa'.repeat(32)
        );
    });

    it('vaults self-synced chat updates encrypted for own vaults', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { saveRatchetSession } = await import('../../../src/main_process/storage/ratchet/operations.js');
        const ratchet = await import('../../../src/main_process/security/ratchet.js');
        const { sendChatUpdate } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 7,
            address: '200::9',
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.getMessageById).mockResolvedValue(undefined);

        await sendChatUpdate('peer-online', '12345678-1234-1234-1234-123456789012', 'edit vault self');
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(ratchet.x3dhInitiator).toHaveBeenCalled();
        expect(ratchet.ratchetEncrypt).toHaveBeenCalled();
        expect(saveRatchetSession).toHaveBeenCalled();
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'self-id',
            expect.objectContaining({
                type: 'CHAT_UPDATE',
                senderUpeerId: 'self-id',
                ratchetHeader: { dh: '44'.repeat(32), pn: 0, n: 0 },
                x3dhInit: {
                    ekPub: '33'.repeat(32),
                    spkId: 13,
                    ikPub: '11'.repeat(32),
                },
                signature: Buffer.from('sig').toString('hex')
            })
        );
    });

    it('serializes a provided link preview in DR chat updates', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { fetchOgPreview } = await import('../../../src/main_process/network/og-fetcher.js');
        const { sendChatUpdate } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 12,
            address: '200::9',
            knownAddresses: '[]'
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.getMessageById).mockResolvedValue({ version: 0 } as NonNullable<MessageRecord>);

        const preview = { url: 'https://example.com', title: 'Example' };
        await sendChatUpdate('peer-online', '12345678-1234-1234-1234-123456789012', 'hola https://example.com', preview);

        expect(fetchOgPreview).not.toHaveBeenCalled();
        expect(messagesOps.updateMessageContent).toHaveBeenCalledWith(
            '12345678-1234-1234-1234-123456789012',
            JSON.stringify({ text: 'hola https://example.com', linkPreview: preview }),
            Buffer.from('sig').toString('hex'),
            1
        );
        const ratchet = await import('../../../src/main_process/security/ratchet.js');
        expect(ratchet.ratchetEncrypt).toHaveBeenCalled();
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
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 14,
            address: '200::9',
            knownAddresses: '[]'
        } as unknown as ContactRecord);
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
        const { saveRatchetSession } = await import('../../../src/main_process/storage/ratchet/operations.js');
        const ratchet = await import('../../../src/main_process/security/ratchet.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 15,
            address: '200::10',
            knownAddresses: '[]'
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(getKademliaInstance).mockReturnValue({
            findClosestContacts: vi.fn(() => [
                { upeerId: 'self-id', address: '200::other-device' },
                { upeerId: 'self-id', address: '200::tablet' }
            ])
        } as unknown as KademliaInstance);

        await sendUDPMessage('peer-online', 'hola sync');

        expect(ratchet.x3dhInitiator).toHaveBeenCalledTimes(2);
        expect(ratchet.ratchetEncrypt).toHaveBeenCalledTimes(2);
        expect(saveRatchetSession).toHaveBeenCalledTimes(2);
        expect(sendSecureUDPMessage).toHaveBeenCalledTimes(3);
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::10',
            expect.objectContaining({
                type: 'CHAT',
                replyTo: undefined,
                ratchetHeader: { dh: '44'.repeat(32), pn: 0, n: 0 },
                x3dhInit: {
                    ekPub: '33'.repeat(32),
                    spkId: 15,
                    ikPub: '11'.repeat(32),
                }
            }),
            'aa'.repeat(32),
            false
        );
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::other-device',
            expect.objectContaining({
                type: 'CHAT',
                replyTo: undefined,
                ratchetHeader: { dh: '44'.repeat(32), pn: 0, n: 0 },
                x3dhInit: {
                    ekPub: '33'.repeat(32),
                    spkId: 13,
                    ikPub: '11'.repeat(32),
                }
            }),
            '11'.repeat(32),
            true
        );
    });

    it('does not silently downgrade to legacy when Double Ratchet fails after a session exists', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const ratchetOps = await import('../../../src/main_process/storage/ratchet/operations.js');
        const ratchet = await import('../../../src/main_process/security/ratchet.js');
        const identity = await import('../../../src/main_process/security/identity.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 21,
            address: '200::10',
            knownAddresses: '[]'
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(ratchetOps.getRatchetSession).mockReturnValueOnce({ state: { rk: Buffer.alloc(32) }, spkIdUsed: 21 } as never);
        vi.mocked(ratchet.ratchetEncrypt).mockImplementationOnce(() => {
            throw new Error('ratchet-corruption');
        });

        await expect(sendUDPMessage('peer-online', 'no downgrade')).rejects.toThrow('ratchet-corruption');
        expect(identity.encrypt).not.toHaveBeenCalled();
    });

    it('vaults a normal chat message for self-sync when no other own device is reachable', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/handlers.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { saveRatchetSession } = await import('../../../src/main_process/storage/ratchet/operations.js');
        const ratchet = await import('../../../src/main_process/security/ratchet.js');
        const { sendUDPMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 16,
            address: '200::10',
            knownAddresses: '[]'
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(getKademliaInstance).mockReturnValue({
            findClosestContacts: vi.fn(() => [])
        } as unknown as KademliaInstance);

        await sendUDPMessage('peer-online', 'hola vault sync');
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(ratchet.x3dhInitiator).toHaveBeenCalled();
        expect(ratchet.ratchetEncrypt).toHaveBeenCalled();
        expect(saveRatchetSession).toHaveBeenCalled();
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'self-id',
            expect.objectContaining({
                type: 'CHAT',
                senderUpeerId: 'self-id',
                ratchetHeader: { dh: '44'.repeat(32), pn: 0, n: 0 },
                x3dhInit: {
                    ekPub: '33'.repeat(32),
                    spkId: 13,
                    ikPub: '11'.repeat(32),
                },
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
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 17,
            address: '200::9',
            knownAddresses: '[]'
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(messagesOps.updateMessageStatus).mockResolvedValue(true);
        vi.mocked(messageStatus.getMessageStatus).mockReturnValue('sent' as MessageStatus);
        vi.mocked(VaultManager.replicateToVaults).mockResolvedValue(0);

        const result = await sendUDPMessage('peer-online', 'sin ack');

        await vi.advanceTimersByTimeAsync(2600);

        expect(result).toBeDefined();
        if (!result) return;
        expect(messagesOps.updateMessageStatus).toHaveBeenCalledWith(result.id, 'failed');
    });

    it('vaults the original encrypted packet after direct ack timeout instead of re-encrypting it', async () => {
        vi.useFakeTimers();

        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const messageStatus = await import('../../../src/main_process/storage/messages/status.js');
        const ratchet = await import('../../../src/main_process/security/ratchet.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { sendConnectedChatMessage } = await import('../../../src/main_process/network/messaging/chatDirectDelivery.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 18,
            address: '200::9',
            knownAddresses: '[]'
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(messagesOps.updateMessageStatus).mockResolvedValue(true);
        vi.mocked(messageStatus.getMessageStatus).mockReturnValue('sent' as MessageStatus);
        vi.mocked(VaultManager.replicateToVaults).mockResolvedValue(1);
        vi.mocked(ratchet.ratchetEncrypt).mockReturnValueOnce({
            header: { dh: '44'.repeat(32), pn: 0, n: 0 },
            ciphertext: 'direct-cipher',
            nonce: 'direct-nonce',
        } as never).mockReturnValueOnce({
            header: { dh: '77'.repeat(32), pn: 0, n: 1 },
            ciphertext: 'fallback-cipher',
            nonce: 'fallback-nonce',
        } as never);

        await sendConnectedChatMessage({
            contact: {
                upeerId: 'peer-online',
                status: 'connected',
                publicKey: 'aa'.repeat(32),
                signedPreKey: 'bb'.repeat(32),
                signedPreKeyId: 18,
                address: '200::9',
            } as unknown as Parameters<typeof sendConnectedChatMessage>[0]['contact'],
            knownAddresses: [],
            msgId: '12345678-1234-1234-1234-123456789012',
            payload: 'hola timeout',
            selfId: 'self-id',
            timestamp: 123456789,
            upeerId: 'peer-online',
            ackTimeoutMs: 2500,
            syncOwnDevices: false,
        });

        await vi.advanceTimersByTimeAsync(2600);

        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::9',
            expect.objectContaining({
                content: 'direct-cipher',
                nonce: 'direct-nonce',
                x3dhInit: {
                    ekPub: '33'.repeat(32),
                    spkId: 18,
                    ikPub: '11'.repeat(32),
                },
            }),
            'aa'.repeat(32),
            false
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-online',
            expect.objectContaining({
                content: 'direct-cipher',
                nonce: 'direct-nonce',
                x3dhInit: {
                    ekPub: '33'.repeat(32),
                    spkId: 18,
                    ikPub: '11'.repeat(32),
                },
                senderUpeerId: 'self-id',
            })
        );
        expect(VaultManager.replicateToVaults).not.toHaveBeenCalledWith(
            'peer-online',
            expect.objectContaining({ content: 'fallback-cipher' })
        );
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
        vi.mocked(contactsOps.getContactByUpeerId).mockImplementation((async (upeerId: string) => {
            if (upeerId === 'peer-online') {
                return {
                    upeerId,
                    status: 'connected',
                    publicKey: 'aa'.repeat(32),
                    address: '200::10',
                    knownAddresses: '[]'
                } as unknown as ContactRecord;
            }

            if (upeerId === 'peer-offline') {
                return {
                    upeerId,
                    status: 'disconnected',
                    publicKey: 'bb'.repeat(32),
                    address: '200::20',
                    knownAddresses: '[]'
                } as unknown as ContactRecord;
            }

            return undefined;
        }) as never);
        vi.mocked(getKademliaInstance).mockReturnValue({
            findClosestContacts: vi.fn(() => [
                { upeerId: 'self-id', address: '200::other-device' },
                { upeerId: 'self-id', address: '200::self' }
            ])
        } as unknown as KademliaInstance);

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