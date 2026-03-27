import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleVaultDelivery } from '../../../src/main_process/network/handlers/vault.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations.js';
import * as messagesOps from '../../../src/main_process/storage/messages/operations.js';
import { fileTransferManager } from '../../../src/main_process/network/file-transfer/transfer-manager.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as validation from '../../../src/main_process/security/validation.js';

type VaultWindow = NonNullable<Parameters<typeof handleVaultDelivery>[2]>;
type VaultSendResponse = Parameters<typeof handleVaultDelivery>[3];
type VaultContact = Awaited<ReturnType<typeof contactsOps.getContactByUpeerId>>;

// Mocks
vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveFileMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/network/file-transfer/transfer-manager.js', () => ({
    fileTransferManager: {
        handleMessage: vi.fn()
    }
}));

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn().mockReturnValue('my-id'),
    getMyPublicKeyHex: vi.fn().mockReturnValue('a'.repeat(64)),
    verify: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../src/main_process/security/validation.js', () => ({
    validateMessage: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    issueVouch: vi.fn().mockResolvedValue(true),
    VouchType: {
        VAULT_RETRIEVED: 'VAULT_RETRIEVED',
        INTEGRITY_FAIL: 'INTEGRITY_FAIL',
        VAULT_CHUNK: 'VAULT_CHUNK'
    }
}));

// Mock dinámico de chat.js (usado dentro de handleVaultDelivery)
vi.mock('../../../src/main_process/network/handlers/chat.js', () => ({
    handleChatMessage: vi.fn(),
    handleIncomingClear: vi.fn(),
    handleChatDelete: vi.fn(),
    handleChatAck: vi.fn(),
    handleChatReaction: vi.fn(),
}));

vi.mock('../../../src/main_process/network/handlers/groups.js', () => ({
    handleGroupMessage: vi.fn(),
    handleGroupInvite: vi.fn(),
    handleGroupLeave: vi.fn(),
    handleGroupUpdate: vi.fn(),
}));

describe('Vault Delivery Handler', () => {
    const mockSendResponse = vi.fn<VaultSendResponse>();
    const mockWin = {} as VaultWindow;
    const custodianSid = 'custodian-id';
    const publicContact = { publicKey: 'pub' } as NonNullable<VaultContact>;
    const originContact = { publicKey: 'origin-pubkey' } as NonNullable<VaultContact>;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should discard non-array entries (DoS protection)', async () => {
        await handleVaultDelivery(custodianSid, { entries: null }, mockWin, mockSendResponse, '1.2.3.4');
        expect(contactsOps.getContactByUpeerId).not.toHaveBeenCalled();
    });

    it('should limit entries to MAX_DELIVERY_ENTRIES (50)', async () => {
        const manyEntries = Array(100).fill({
            senderSid: 'origin-id',
            data: Buffer.from(JSON.stringify({ type: 'CHAT', signature: 'sig' })).toString('hex')
        });

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'pubkey' } as NonNullable<VaultContact>);

        await handleVaultDelivery(custodianSid, { entries: manyEntries }, mockWin, mockSendResponse, '1.2.3.4');

        expect(contactsOps.getContactByUpeerId).toHaveBeenCalledTimes(50);
    });

    it('should verify integrity of inner packets', async () => {
        const innerPacket = { type: 'CHAT', text: 'hello', senderUpeerId: 'origin-id', signature: 'inner-sig' };
        const entry = {
            senderSid: 'origin-id',
            data: Buffer.from(JSON.stringify(innerPacket)).toString('hex')
        };

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(originContact);
        vi.mocked(identity.verify).mockReturnValue(false);

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        expect(identity.verify).toHaveBeenCalled();
        const chatModule = await import('../../../src/main_process/network/handlers/chat.js');
        expect(chatModule.handleChatMessage).not.toHaveBeenCalled();
    });

    it('should validate structural integrity of inner packets (validateMessage)', async () => {
        const innerPacket = { type: 'CHAT', text: 'hello', senderUpeerId: 'origin-id', signature: 'inner-sig' };
        const entry = {
            senderSid: 'origin-id',
            data: Buffer.from(JSON.stringify(innerPacket)).toString('hex')
        };

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(originContact);
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(validation.validateMessage).mockReturnValue({ valid: false, error: 'invalid-structure' });

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        expect(validation.validateMessage).toHaveBeenCalled();
        const chatModule = await import('../../../src/main_process/network/handlers/chat.js');
        expect(chatModule.handleChatMessage).not.toHaveBeenCalled();
    });

    it('should process valid CHAT entries from vault', async () => {
        const innerPacket = { type: 'CHAT', text: 'secret', senderUpeerId: 'origin-id', signature: 'inner-sig' };
        const entry = {
            senderSid: 'origin-id',
            data: Buffer.from(JSON.stringify(innerPacket)).toString('hex')
        };

        const mockContact = { upeerId: 'origin-id', publicKey: 'origin-pubkey' };
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(mockContact as NonNullable<VaultContact>);
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(validation.validateMessage).mockReturnValue({ valid: true });

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        const chatModule = await import('../../../src/main_process/network/handlers/chat.js');
        expect(chatModule.handleChatMessage).toHaveBeenCalledWith(
            'origin-id',
            mockContact,
            expect.objectContaining({ type: 'CHAT', text: 'secret' }),
            mockWin,
            'inner-sig',
            '1.2.3.4',
            mockSendResponse
        );
    });

    it('should process own vaulted CHAT entries using local identity and internal sync', async () => {
        const innerPacket = { type: 'CHAT', content: 'aa', nonce: 'bb', senderUpeerId: 'my-id', signature: 'inner-sig' };
        const entry = {
            senderSid: 'my-id',
            data: Buffer.from(JSON.stringify(innerPacket)).toString('hex')
        };

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(null);
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(validation.validateMessage).mockReturnValue({ valid: true });

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        const chatModule = await import('../../../src/main_process/network/handlers/chat.js');
        expect(chatModule.handleChatMessage).toHaveBeenCalledWith(
            'my-id',
            expect.objectContaining({ upeerId: 'my-id', publicKey: 'a'.repeat(64) }),
            expect.objectContaining({ type: 'CHAT', isInternalSync: true }),
            mockWin,
            'inner-sig',
            '1.2.3.4',
            mockSendResponse
        );
    });

    it('should process CHAT_DELETE entries', async () => {
        const innerPacket = { type: 'CHAT_DELETE', msgId: 'uuid', signature: 'sig' };
        const entry = { senderSid: 'origin-id', data: Buffer.from(JSON.stringify(innerPacket)).toString('hex') };
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        const chatModule = await import('../../../src/main_process/network/handlers/chat.js');
        expect(chatModule.handleChatDelete).toHaveBeenCalledWith('origin-id', expect.anything(), mockWin);
    });

    it('should process CHAT_REACTION entries', async () => {
        const innerPacket = { type: 'CHAT_REACTION', msgId: '12345678-1234-1234-1234-123456789012', emoji: '👍', remove: false, signature: 'sig' };
        const entry = { senderSid: 'origin-id', data: Buffer.from(JSON.stringify(innerPacket)).toString('hex') };
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        const chatModule = await import('../../../src/main_process/network/handlers/chat.js');
        expect(chatModule.handleChatReaction).toHaveBeenCalledWith('origin-id', expect.anything(), mockWin);
    });

    it('should process ACK and READ entries', async () => {
        const ackPacket = { type: 'ACK', msgId: 'ack-1', signature: 'sig' };
        const readPacket = { type: 'READ', msgId: 'read-1', signature: 'sig' };

        const entries = [
            { senderSid: 'origin-id', data: Buffer.from(JSON.stringify(ackPacket)).toString('hex') },
            { senderSid: 'origin-id', data: Buffer.from(JSON.stringify(readPacket)).toString('hex') }
        ];

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);

        await handleVaultDelivery(custodianSid, { entries: entries }, mockWin, mockSendResponse, '1.2.3.4');

        const chatModule = await import('../../../src/main_process/network/handlers/chat.js');
        expect(chatModule.handleChatAck).toHaveBeenCalledTimes(2);
        expect(chatModule.handleChatAck).toHaveBeenLastCalledWith('origin-id', expect.objectContaining({ status: 'read' }), mockWin);
    });

    it('should process FILE_DATA_SMALL entries', async () => {
        const innerPacket = {
            type: 'FILE_DATA_SMALL',
            fileHash: 'a'.repeat(64),
            fileName: 'test.txt',
            fileSize: 123,
            mimeType: 'text/plain',
            signature: 'sig'
        };
        const entry = { senderSid: 'origin-id', data: Buffer.from(JSON.stringify(innerPacket)).toString('hex') };
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        expect(messagesOps.saveFileMessage).toHaveBeenCalledWith(
            innerPacket.fileHash,
            'origin-id',
            false,
            'test.txt',
            innerPacket.fileHash,
            123,
            'text/plain',
            undefined,
            'delivered'
        );
    });

    it('should delegate FILE_ prefixed types to fileTransferManager', async () => {
        const innerPacket = { type: 'FILE_OFFER', fileHash: 'hash', signature: 'sig' };
        const entry = { senderSid: 'origin-id', data: Buffer.from(JSON.stringify(innerPacket)).toString('hex') };
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        expect(fileTransferManager.handleMessage).toHaveBeenCalledWith('origin-id', '1.2.3.4', expect.objectContaining({ type: 'FILE_OFFER' }));
    });

    it('should process GROUP_MSG, GROUP_INVITE, GROUP_UPDATE and GROUP_LEAVE entries', async () => {
        const msgPacket = { type: 'GROUP_MSG', groupId: 'g1', text: 'hi', signature: 'sig' };
        const invitePacket = { type: 'GROUP_INVITE', groupId: 'g1', signature: 'sig' };
        const updatePacket = { type: 'GROUP_UPDATE', groupId: 'g1', signature: 'sig' };
        const leavePacket = { type: 'GROUP_LEAVE', groupId: 'g1', signature: 'sig' };

        const entries = [
            { senderSid: 'origin-id', data: Buffer.from(JSON.stringify(msgPacket)).toString('hex') },
            { senderSid: 'origin-id', data: Buffer.from(JSON.stringify(invitePacket)).toString('hex') },
            { senderSid: 'origin-id', data: Buffer.from(JSON.stringify(updatePacket)).toString('hex') },
            { senderSid: 'origin-id', data: Buffer.from(JSON.stringify(leavePacket)).toString('hex') }
        ];

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);

        await handleVaultDelivery(custodianSid, { entries: entries }, mockWin, mockSendResponse, '1.2.3.4');

        const groupsModule = await import('../../../src/main_process/network/handlers/groups.js');
        expect(groupsModule.handleGroupMessage).toHaveBeenCalled();
        expect(groupsModule.handleGroupInvite).toHaveBeenCalled();
        expect(groupsModule.handleGroupUpdate).toHaveBeenCalled();
        expect(groupsModule.handleGroupLeave).toHaveBeenCalled();
    });

    it('should mark own vaulted GROUP_LEAVE entries as internal sync', async () => {
        const entry = {
            senderSid: 'my-id',
            data: Buffer.from(JSON.stringify({ type: 'GROUP_LEAVE', groupId: 'g1', senderUpeerId: 'my-id', signature: 'sig' })).toString('hex')
        };

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(null);
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(validation.validateMessage).mockReturnValue({ valid: true });

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        const groupsModule = await import('../../../src/main_process/network/handlers/groups.js');
        expect(groupsModule.handleGroupLeave).toHaveBeenCalledWith(
            'my-id',
            expect.objectContaining({ type: 'GROUP_LEAVE', isInternalSync: true }),
            mockWin
        );
    });

    it('should handle raw file shards', async () => {
        const entry = {
            senderSid: 'origin-id',
            payloadHash: 'shard:abc:0',
            data: 'some-hex-data', // No es JSON
            signature: null // No suele tener firma el outer entry si es raw shard (o se ignora)
        };

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        expect(messagesOps.saveFileMessage).toHaveBeenCalledWith(
            'abc',
            'origin-id',
            false,
            'abc',
            'abc',
            0,
            'application/octet-stream',
            undefined,
            'delivered'
        );
    });

    it('should request next page if data.hasMore is true', async () => {
        const entry = {
            senderSid: 'origin-id',
            data: Buffer.from(JSON.stringify({ type: 'CHAT', signature: 'sig' })).toString('hex'),
            payloadHash: 'h1'
        };

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);

        await handleVaultDelivery(custodianSid, { entries: [entry], hasMore: true, nextOffset: 50 }, mockWin, mockSendResponse, '1.2.3.4');

        expect(mockSendResponse).toHaveBeenCalledWith('1.2.3.4', expect.objectContaining({
            type: 'VAULT_QUERY',
            offset: 50
        }));
    });

    it('should continue and log error if an entry fails to process', async () => {
        const entries = [
            { senderSid: 'origin-id', data: 'not-hex' }, // Provocará error al parsear o buffer
            { senderSid: 'origin-id', data: Buffer.from(JSON.stringify({ type: 'CHAT', signature: 'sig' })).toString('hex'), payloadHash: 'h2' }
        ];

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);

        await handleVaultDelivery(custodianSid, { entries }, mockWin, mockSendResponse, '1.2.3.4');

        const chatModule = await import('../../../src/main_process/network/handlers/chat.js');
        expect(chatModule.handleChatMessage).toHaveBeenCalled();
    });

    it('should ignore unknown original sender', async () => {
        const entry = { senderSid: 'unknown-id', data: 'data' };
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(null);

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        expect(identity.verify).not.toHaveBeenCalled();
    });

    it('should handle non-JSON data gracefully', async () => {
        const entry = { senderSid: 'origin-id', data: Buffer.from('not-json').toString('hex'), payloadHash: 'h1' };
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        expect(mockSendResponse).toHaveBeenCalledWith('1.2.3.4', expect.objectContaining({
            type: 'VAULT_ACK',
            payloadHashes: ['h1']
        }));
    });
});
