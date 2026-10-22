import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleVaultDelivery } from '../../../src/main_process/network/handlers/vault.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations.js';
import * as messagesOps from '../../../src/main_process/storage/messages/operations.js';
import * as vouches from '../../../src/main_process/security/reputation/vouches.js';
import { fileTransferManager } from '../../../src/main_process/network/file-transfer/transfer-manager.js';
import * as fileTransferSignature from '../../../src/main_process/network/file-transfer/signature.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as validation from '../../../src/main_process/security/validation.js';

type VaultWindow = NonNullable<Parameters<typeof handleVaultDelivery>[2]>;
type VaultSendResponse = Parameters<typeof handleVaultDelivery>[3];
type VaultContact = Awaited<ReturnType<typeof contactsOps.getContactByUpeerId>>;

// Mocks
vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
    isContactBlocked: vi.fn(() => false),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveFileMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/vault/operations.js', () => ({
    saveVaultEntry: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/vault/asset-operations.js', () => ({
    trackDistributedAsset: vi.fn(),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    SHARD_TTL_MS: 60_000,
}));

vi.mock('../../../src/main_process/network/file-transfer/transfer-manager.js', () => ({
    fileTransferManager: {
        handleMessage: vi.fn(),
        tryRecoverVaultTransferByFileHash: vi.fn(),
        getAllTransfers: vi.fn().mockReturnValue([]),
    }
}));

vi.mock('../../../src/main_process/network/file-transfer/signature.js', () => ({
    verifyFileTransferPacketSignature: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn().mockReturnValue('my-id'),
    getMyPublicKeyHex: vi.fn().mockReturnValue('a'.repeat(64)),
    getMyDeviceId: vi.fn().mockReturnValue(''),
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
        vi.mocked(contactsOps.isContactBlocked).mockReturnValue(false);
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(identity.getMyDeviceId).mockReturnValue('');
        vi.mocked(validation.validateMessage).mockReturnValue({ valid: true });
        vi.mocked(fileTransferSignature.verifyFileTransferPacketSignature).mockReturnValue(true);
    });

    it('should discard non-array entries (DoS protection)', async () => {
        await handleVaultDelivery(custodianSid, { entries: null }, mockWin, mockSendResponse, '1.2.3.4');
        expect(contactsOps.getContactByUpeerId).not.toHaveBeenCalled();
    });

    it('ignores vault entries addressed to another device', async () => {
        const entry = {
            senderSid: 'origin-id',
            recipientDeviceId: 'bb'.repeat(32),
            data: Buffer.from(JSON.stringify({ type: 'CHAT', signature: 'sig' })).toString('hex'),
            payloadHash: 'other-device',
        };

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        expect(contactsOps.getContactByUpeerId).not.toHaveBeenCalled();
        expect(mockSendResponse).not.toHaveBeenCalled();
    });

    it('processes and ACKs vault entries addressed to this device', async () => {
        const deviceId = 'aa'.repeat(32);
        vi.mocked(identity.getMyDeviceId).mockReturnValue(deviceId);
        const entry = {
            senderSid: 'origin-id',
            recipientDeviceId: deviceId,
            data: Buffer.from(JSON.stringify({ type: 'CHAT', signature: 'sig' })).toString('hex'),
            payloadHash: 'own-device',
        };
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(originContact);

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        const { handleChatMessage } = await import('../../../src/main_process/network/handlers/chat.js');
        expect(handleChatMessage).toHaveBeenCalled();
        expect(mockSendResponse).toHaveBeenCalledWith('1.2.3.4', expect.objectContaining({
            type: 'VAULT_ACK',
            deviceId,
            payloadHashes: ['own-device'],
        }));
    });

    it('should limit entries to MAX_DELIVERY_ENTRIES (120)', async () => {
        const manyEntries = Array(200).fill({
            senderSid: 'origin-id',
            data: Buffer.from(JSON.stringify({ type: 'CHAT', signature: 'sig' })).toString('hex')
        });

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'pubkey' } as NonNullable<VaultContact>);

        await handleVaultDelivery(custodianSid, { entries: manyEntries }, mockWin, mockSendResponse, '1.2.3.4');

        expect(contactsOps.getContactByUpeerId).toHaveBeenCalledTimes(120);
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

    it('should verify a self-sync packet signed with senderUpeerId and reject an invalid signature', async () => {
        const innerPacket = { type: 'CHAT', id: 'sync-id', senderUpeerId: 'origin-id', signature: 'inner-sig' };
        const entry = { senderSid: 'origin-id', data: Buffer.from(JSON.stringify(innerPacket)).toString('hex') };
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(originContact);
        vi.mocked(identity.verify).mockImplementation((payload) => payload.toString().includes('senderUpeerId'));

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        const chatModule = await import('../../../src/main_process/network/handlers/chat.js');
        expect(chatModule.handleChatMessage).toHaveBeenCalledOnce();

        vi.mocked(identity.verify).mockReturnValue(false);
        vi.mocked(chatModule.handleChatMessage).mockClear();
        await handleVaultDelivery(custodianSid, { entries: [{ ...entry, data: Buffer.from(JSON.stringify({ ...innerPacket, id: 'invalid-id' })).toString('hex') }] }, mockWin, mockSendResponse, '1.2.3.4');

        expect(chatModule.handleChatMessage).not.toHaveBeenCalled();
        expect(vouches.issueVouch).toHaveBeenCalledWith(custodianSid, 'INTEGRITY_FAIL');
    });

    it('should emit a single integrity failure vouch per delivery batch', async () => {
        const invalidEntryA = {
            senderSid: 'origin-id',
            data: Buffer.from(JSON.stringify({ type: 'CHAT', text: 'a', senderUpeerId: 'origin-id', signature: 'sig-a' })).toString('hex')
        };
        const invalidEntryB = {
            senderSid: 'origin-id',
            data: Buffer.from(JSON.stringify({ type: 'CHAT', text: 'b', senderUpeerId: 'origin-id', signature: 'sig-b' })).toString('hex')
        };

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(originContact);
        vi.mocked(identity.verify).mockReturnValue(false);

        await handleVaultDelivery(custodianSid, { entries: [invalidEntryA, invalidEntryB] }, mockWin, mockSendResponse, '1.2.3.4');

        expect(vouches.issueVouch).toHaveBeenCalledTimes(1);
        expect(vouches.issueVouch).toHaveBeenCalledWith(custodianSid, 'INTEGRITY_FAIL');
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
        expect(vouches.issueVouch).not.toHaveBeenCalledWith(custodianSid, 'VAULT_RETRIEVED');
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
        expect(vouches.issueVouch).toHaveBeenCalledWith(custodianSid, 'VAULT_RETRIEVED');
    });

    it('silently ignores private vault entries from a locally blocked sender', async () => {
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(originContact);
        vi.mocked(contactsOps.isContactBlocked).mockReturnValue(true);
        const entry = {
            senderSid: 'origin-id',
            data: Buffer.from(JSON.stringify({ type: 'CHAT', id: 'm1', content: 'hello', signature: 'inner-sig' })).toString('hex'),
        };

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        const chatModule = await import('../../../src/main_process/network/handlers/chat.js');
        expect(chatModule.handleChatMessage).not.toHaveBeenCalled();
        expect(mockSendResponse).not.toHaveBeenCalled();
    });

    it('should process own vaulted CHAT entries using local identity and internal sync', async () => {
        const innerPacket = { type: 'CHAT', content: 'aa', nonce: 'bb', senderUpeerId: 'my-id', signature: 'inner-sig' };
        const entry = {
            senderSid: 'my-id',
            data: Buffer.from(JSON.stringify(innerPacket)).toString('hex')
        };

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(undefined);
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
        expect(fileTransferManager.tryRecoverVaultTransferByFileHash).not.toHaveBeenCalled();
    });

    it('does not vouch shard custodians until the recovered file is complete', async () => {
        const shardEntry = {
            senderSid: 'origin-id',
            payloadHash: 'shard:complete-file:0:0',
            data: 'some-hex-data',
        };
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);
        vi.mocked(fileTransferManager.getAllTransfers).mockReturnValue([]);

        await handleVaultDelivery(custodianSid, { entries: [shardEntry] }, mockWin, mockSendResponse, 'complete-file-source');
        expect(vouches.issueVouch).not.toHaveBeenCalledWith(custodianSid, 'VAULT_RETRIEVED');
        expect(vouches.issueVouch).not.toHaveBeenCalledWith(custodianSid, 'VAULT_CHUNK');
    });

    it('vouches a shard custodian once after the recovered file completes', async () => {
        const shardEntry = {
            senderSid: 'origin-id',
            payloadHash: 'shard:completed-file:0:0',
            data: 'some-hex-data',
        };
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);
        vi.mocked(fileTransferManager.getAllTransfers).mockReturnValue([{
            fileId: 'completed-file-id',
            fileHash: 'completed-file',
            direction: 'receiving',
            state: 'completed',
        } as never]);

        await handleVaultDelivery(custodianSid, { entries: [shardEntry] }, mockWin, mockSendResponse, 'completed-file-source');
        await vi.waitFor(() => expect(vouches.issueVouch).toHaveBeenCalledWith(custodianSid, 'VAULT_CHUNK'));
        await handleVaultDelivery(custodianSid, { entries: [shardEntry] }, mockWin, mockSendResponse, 'completed-file-source');

        expect(vouches.issueVouch).toHaveBeenCalledTimes(1);
        expect(vouches.issueVouch).toHaveBeenCalledWith(custodianSid, 'VAULT_CHUNK');
    });

    it('should trigger vault attachment recovery after FILE_PROPOSAL entries', async () => {
        const innerPacket = { type: 'FILE_PROPOSAL', fileHash: 'a'.repeat(64), fileId: 'file-1', fileName: 'doc.bin', fileSize: 12, mimeType: 'application/octet-stream', totalChunks: 1, chunkSize: 12, signature: 'sig' };
        const entry = { senderSid: 'origin-id', data: Buffer.from(JSON.stringify(innerPacket)).toString('hex') };
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        expect(fileTransferManager.handleMessage).toHaveBeenCalledWith('origin-id', '1.2.3.4', expect.objectContaining({ type: 'FILE_PROPOSAL' }));
        expect(fileTransferManager.tryRecoverVaultTransferByFileHash).toHaveBeenCalledWith('a'.repeat(64));
    });

    it('should verify FILE_PROPOSAL vault entries with the file transfer signature rules', async () => {
        const innerPacket = {
            type: 'FILE_PROPOSAL',
            fileId: 'file-2',
            fileName: 'doc.bin',
            fileSize: 12,
            mimeType: 'application/octet-stream',
            totalChunks: 1,
            chunkSize: 12,
            fileHash: 'b'.repeat(64),
            senderUpeerId: 'origin-id',
            signature: 'sig'
        };
        const entry = { senderSid: 'origin-id', data: Buffer.from(JSON.stringify(innerPacket)).toString('hex') };

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(originContact);
        vi.mocked(identity.verify).mockReturnValue(false);
        vi.mocked(fileTransferSignature.verifyFileTransferPacketSignature).mockReturnValue(true);

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        expect(fileTransferSignature.verifyFileTransferPacketSignature).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'FILE_PROPOSAL', fileId: 'file-2' }),
            'origin-pubkey'
        );
        expect(fileTransferManager.handleMessage).toHaveBeenCalledWith('origin-id', '1.2.3.4', expect.objectContaining({ type: 'FILE_PROPOSAL' }));
        expect(vouches.issueVouch).not.toHaveBeenCalledWith(custodianSid, 'INTEGRITY_FAIL');
    });

    it('verifies a device-signed GROUP_MSG using the announced sender device key', async () => {
        const devicePublicKey = 'cd'.repeat(32);
        const innerPacket = {
            type: 'GROUP_MSG',
            id: '550e8400-e29b-41d4-a716-446655440010',
            groupId: 'group-1',
            content: 'ciphertext',
            nonce: '11'.repeat(24),
            epoch: 1,
            senderUpeerId: 'origin-id',
            senderDeviceId: 'ef'.repeat(32),
            signature: 'inner-sig',
        };
        const entry = { senderSid: 'origin-id', data: Buffer.from(JSON.stringify(innerPacket)).toString('hex') };
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'origin-id',
            publicKey: 'origin-pubkey',
            deviceId: 'ef'.repeat(32),
            devicePublicKey,
        } as NonNullable<VaultContact>);
        vi.mocked(identity.verify).mockImplementation((_payload, _signature, publicKey) =>
            publicKey.toString('hex') === devicePublicKey);

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        const groupsModule = await import('../../../src/main_process/network/handlers/groups.js');
        expect(identity.verify).toHaveBeenCalledWith(
            expect.any(Buffer),
            expect.any(Buffer),
            Buffer.from(devicePublicKey, 'hex'),
        );
        expect(groupsModule.handleGroupMessage).toHaveBeenCalled();
    });

    it('rejects a device-signed vault packet when the device binding does not match', async () => {
        const innerPacket = {
            type: 'GROUP_MSG',
            id: '550e8400-e29b-41d4-a716-446655440011',
            groupId: 'group-1',
            content: 'ciphertext',
            nonce: '11'.repeat(24),
            epoch: 1,
            senderUpeerId: 'origin-id',
            senderDeviceId: 'ef'.repeat(32),
            signature: 'inner-sig',
        };
        const entry = { senderSid: 'origin-id', data: Buffer.from(JSON.stringify(innerPacket)).toString('hex') };
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'origin-id',
            publicKey: 'origin-pubkey',
            deviceId: 'aa'.repeat(32),
            devicePublicKey: 'cd'.repeat(32),
        } as NonNullable<VaultContact>);
        vi.mocked(identity.verify).mockReturnValue(false);

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        const groupsModule = await import('../../../src/main_process/network/handlers/groups.js');
        expect(identity.verify).not.toHaveBeenCalledWith(
            expect.any(Buffer),
            expect.any(Buffer),
            Buffer.from('cd'.repeat(32), 'hex'),
        );
        expect(groupsModule.handleGroupMessage).not.toHaveBeenCalled();
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

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(undefined);
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
        const vaultOps = await import('../../../src/main_process/storage/vault/operations.js');
        const assetOps = await import('../../../src/main_process/storage/vault/asset-operations.js');
        const entry = {
            senderSid: 'origin-id',
            payloadHash: 'shard:abc:0',
            data: 'some-hex-data', // No es JSON
            signature: null // No suele tener firma el outer entry si es raw shard (o se ignora)
        };

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);

        await handleVaultDelivery(custodianSid, { entries: [entry] }, mockWin, mockSendResponse, '1.2.3.4');

        expect(messagesOps.saveFileMessage).not.toHaveBeenCalled();
        expect(vaultOps.saveVaultEntry).toHaveBeenCalledWith(
            'shard:abc:0',
            'my-id',
            'origin-id',
            3,
            'some-hex-data',
            expect.any(Number)
        );
        expect(assetOps.trackDistributedAsset).toHaveBeenCalledWith(
            'abc',
            'shard:abc:0',
            0,
            12,
            'my-id',
            0
        );
        expect(fileTransferManager.tryRecoverVaultTransferByFileHash).toHaveBeenCalledWith('abc');
    });

    it('should request next page if data.hasMore is true', async () => {
        const entry = {
            senderSid: 'origin-id',
            data: Buffer.from(JSON.stringify({ type: 'CHAT', signature: 'sig' })).toString('hex'),
            payloadHash: 'h1'
        };

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);

        await handleVaultDelivery(custodianSid, { entries: [entry], hasMore: true, nextAfterId: 50 }, mockWin, mockSendResponse, '1.2.3.4');

        expect(mockSendResponse).toHaveBeenCalledWith('1.2.3.4', expect.objectContaining({
            type: 'VAULT_QUERY',
            afterId: 50
        }));
    });

    it('continues pagination with a stable entry ID cursor', async () => {
        const entry = {
            senderSid: 'origin-id',
            data: Buffer.from(JSON.stringify({ type: 'CHAT', signature: 'sig' })).toString('hex'),
            payloadHash: 'cursor-hash'
        };

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);

        await handleVaultDelivery(custodianSid, {
            entries: [entry],
            hasMore: true,
            nextAfterId: 54321,
        }, mockWin, mockSendResponse, '5.6.7.8');

        expect(mockSendResponse).toHaveBeenCalledWith('5.6.7.8', expect.objectContaining({
            type: 'VAULT_QUERY',
            afterId: 54321,
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
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(undefined);

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

    it('ACKea cada página procesada antes de solicitar la siguiente usando el cursor', async () => {
        const page1 = { senderSid: 'origin-id', data: Buffer.from('shard-a').toString('hex'), payloadHash: 'p1' };
        const page2 = { senderSid: 'origin-id', data: Buffer.from('shard-b').toString('hex'), payloadHash: 'p2' };
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(publicContact);

        await handleVaultDelivery(custodianSid, { entries: [page1], hasMore: true, nextAfterId: 1 }, mockWin, mockSendResponse, '9.9.9.9');
        expect(mockSendResponse).toHaveBeenNthCalledWith(1, '9.9.9.9', {
            type: 'VAULT_ACK',
            payloadHashes: ['p1'],
        });
        expect(mockSendResponse).toHaveBeenNthCalledWith(2, '9.9.9.9', expect.objectContaining({
            type: 'VAULT_QUERY',
            afterId: 1,
        }));

        mockSendResponse.mockClear();
        await handleVaultDelivery(custodianSid, { entries: [page2], hasMore: false }, mockWin, mockSendResponse, '9.9.9.9');
        expect(mockSendResponse).toHaveBeenCalledWith('9.9.9.9', {
            type: 'VAULT_ACK',
            payloadHashes: ['p2'],
        });
    });
});
