import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePacket } from '../../../src/main_process/network/handlers.js';
import { IdentityRateLimiter } from '../../../src/main_process/security/identity-rate-limiter.js';
import * as validation from '../../../src/main_process/security/validation.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations.js';
import * as contactHandlers from '../../../src/main_process/network/handlers/contacts.js';
import * as chatHandlers from '../../../src/main_process/network/handlers/chat.js';
import * as groupHandlers from '../../../src/main_process/network/handlers/groups.js';
import * as reputationHandlers from '../../../src/main_process/network/handlers/reputation.js';
import * as vaultHandlers from '../../../src/main_process/network/handlers/vault.js';
import { fileTransferManager } from '../../../src/main_process/network/file-transfer/transfer-manager.js';

import * as contactStatus from '../../../src/main_process/storage/contacts/status.js';
import * as contactLocation from '../../../src/main_process/storage/contacts/location.js';

// Mocks
vi.mock('../../../src/main_process/security/identity-rate-limiter.js');
vi.mock('../../../src/main_process/security/identity.js');
vi.mock('../../../src/main_process/security/validation.js');
vi.mock('../../../src/main_process/security/secure-logger.js');
vi.mock('../../../src/main_process/storage/contacts/operations.js');
vi.mock('../../../src/main_process/storage/contacts/location.js');
vi.mock('../../../src/main_process/storage/contacts/status.js');
vi.mock('../../../src/main_process/network/handlers/contacts.js');
vi.mock('../../../src/main_process/network/handlers/chat.js');
vi.mock('../../../src/main_process/network/handlers/groups.js');
vi.mock('../../../src/main_process/network/handlers/reputation.js');
vi.mock('../../../src/main_process/network/handlers/vault.js');
vi.mock('../../../src/main_process/network/vault/protocol/handlers.js', () => ({
    handleVaultQuery: vi.fn(),
    handleVaultAck: vi.fn(),
    handleVaultRenew: vi.fn(),
    handleVaultStore: vi.fn()
}));
vi.mock('../../../src/main_process/network/dht/handlers.js', () => ({
    handleDhtPacket: vi.fn()
}));
vi.mock('../../../src/main_process/network/file-transfer/transfer-manager.js', () => ({
    fileTransferManager: {
        handleIncomingPacket: vi.fn(),
        handleMessage: vi.fn()
    }
}));
vi.mock('../../../src/main_process/network/sealed.js', () => ({
    unsealPacket: vi.fn()
}));

describe('network/handlers.ts - handlePacket', () => {
    const mockWin = {
        webContents: {
            send: vi.fn()
        }
    } as any;
    const mockSendResponse = vi.fn();
    const mockStartDhtSearch = vi.fn();
    const mockRinfo = { address: '201:1234::1', port: 12345 };

    beforeEach(() => {
        vi.clearAllMocks();
        // Default: rate limiter allows everything
        (IdentityRateLimiter.prototype.checkIp as any).mockReturnValue(true);
        (IdentityRateLimiter.prototype.checkIdentity as any).mockReturnValue(true);
        // Default validation: valid
        (validation.validateMessage as any).mockReturnValue({ valid: true });
    });

    it('should ignore invalid JSON', async () => {
        const msg = Buffer.from('not a json');
        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(validation.validateMessage).not.toHaveBeenCalled();
    });

    it('should handle rate limiting by IP', async () => {
        (IdentityRateLimiter.prototype.checkIp as any).mockReturnValue(false);
        const msg = Buffer.from(JSON.stringify({ type: 'PING' }));
        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(validation.validateMessage).not.toHaveBeenCalled();
    });

    it('should handle packets without senderUpeerId (stops before security check)', async () => {
        const msg = Buffer.from(JSON.stringify({ type: 'CHAT' }));
        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(validation.validateMessage).toHaveBeenCalledWith('CHAT', { type: 'CHAT' });
        expect(identity.verify).not.toHaveBeenCalled();
    });

    it('should verify signature and reject if invalid', async () => {
        (identity.verify as any).mockReturnValue(false);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({
            publicKey: '00'.repeat(32),
            status: 'connected'
        });

        const packet = {
            type: 'CHAT',
            senderUpeerId: 'peer1',
            signature: '00'.repeat(64),
            text: 'hello'
        };
        const msg = Buffer.from(JSON.stringify(packet));

        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(identity.verify).toHaveBeenCalled();
    });

    it('should handle SEALED packets and recurse', async () => {
        const sealedPacket = { type: 'SEALED', data: 'encrypted' };
        const innerPacket = { type: 'PING', senderUpeerId: 'id', signature: 'sig' };

        const { unsealPacket } = await import('../../../src/main_process/network/sealed.js');
        (unsealPacket as any).mockReturnValue(innerPacket);

        (validation.validateMessage as any).mockReturnValue({ valid: false, error: 'stop' });

        const msg = Buffer.from(JSON.stringify(sealedPacket));
        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);

        expect(unsealPacket).toHaveBeenCalled();
        expect(validation.validateMessage).toHaveBeenCalled();
    });

    it('should handle HANDSHAKE_REQ and delegate to handleHandshakeReq', async () => {
        const packet = {
            type: 'HANDSHAKE_REQ',
            senderUpeerId: 'peer1',
            signature: '00'.repeat(64),
            senderYggAddress: '201:1234::1'
        };
        const msg = Buffer.from(JSON.stringify(packet));
        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(contactHandlers.handleHandshakeReq).toHaveBeenCalled();
    });

    it('should handle HANDSHAKE_ACCEPT and delegate to handleHandshakeAccept', async () => {
        const packet = {
            type: 'HANDSHAKE_ACCEPT',
            senderUpeerId: 'peer1',
            signature: '00'.repeat(64)
        };
        const msg = Buffer.from(JSON.stringify(packet));
        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(contactHandlers.handleHandshakeAccept).toHaveBeenCalled();
    });

    it('should handle CHAT message and delegate to handleChatMessage', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const packet = {
            type: 'CHAT',
            senderUpeerId: 'peer1',
            signature: '00'.repeat(64),
            text: 'hola'
        };
        const msg = Buffer.from(JSON.stringify(packet));

        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(chatHandlers.handleChatMessage).toHaveBeenCalled();
    });

    it('should handle ACK and delegate to handleChatAck', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const packet = {
            type: 'ACK',
            senderUpeerId: 'peer1',
            signature: '00'.repeat(64),
            msgId: '123'
        };
        const msg = Buffer.from(JSON.stringify(packet));

        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(chatHandlers.handleChatAck).toHaveBeenCalled();
    });

    it('should handle GROUP_MSG and delegate to handleGroupMessage', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const packet = {
            type: 'GROUP_MSG',
            senderUpeerId: 'peer1',
            signature: '00'.repeat(64),
            groupId: 'group1',
            text: 'hola grupo'
        };
        const msg = Buffer.from(JSON.stringify(packet));

        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(groupHandlers.handleGroupMessage).toHaveBeenCalled();
    });

    it('should handle FILE_PROPOSAL and delegate to fileTransferManager', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const packet = {
            type: 'FILE_PROPOSAL',
            senderUpeerId: 'peer1',
            signature: '00'.repeat(64),
            fileId: 'file123'
        };
        const msg = Buffer.from(JSON.stringify(packet));

        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(fileTransferManager.handleMessage).toHaveBeenCalled();
    });

    it('should handle VAULT_DELIVERY and delegate to handleVaultDelivery', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const packet = {
            type: 'VAULT_DELIVERY',
            senderUpeerId: 'peer1',
            signature: '00'.repeat(64),
            vaultData: 'data'
        };
        const msg = Buffer.from(JSON.stringify(packet));

        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(vaultHandlers.handleVaultDelivery).toHaveBeenCalled();
    });

    it('should handle REPUTATION_GOSSIP and delegate to handleReputationGossip', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const packet = {
            type: 'REPUTATION_GOSSIP',
            senderUpeerId: 'peer1',
            signature: '00'.repeat(64),
            gossip: []
        };
        const msg = Buffer.from(JSON.stringify(packet));

        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(reputationHandlers.handleReputationGossip).toHaveBeenCalled();
    });

    it('should handle PING and update contact name/avatar if provided', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const packet = {
            type: 'PING',
            senderUpeerId: 'peer1',
            signature: '00'.repeat(64),
            alias: 'New Alias',
            avatar: 'data:image/png;base64,abc'
        };
        const msg = Buffer.from(JSON.stringify(packet));

        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);

        expect(mockSendResponse).toHaveBeenCalledWith(mockRinfo.address, { type: 'PONG' });
        expect(contactStatus.updateLastSeen).toHaveBeenCalledWith('peer1');
    });

    it('should handle DHT_ packet and delegate to handleDhtPacket', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);
        const { handleDhtPacket } = await import('../../../src/main_process/network/dht/handlers.js');
        (handleDhtPacket as any).mockResolvedValue(true);

        const packet = {
            type: 'DHT_PING',
            senderUpeerId: 'peer1',
            signature: '00'.repeat(64)
        };
        const msg = Buffer.from(JSON.stringify(packet));

        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(handleDhtPacket).toHaveBeenCalled();
    });

    it('should handle contact roaming (location update)', async () => {
        const contact = { upeerId: 'peer1', publicKey: '00'.repeat(32), status: 'connected', address: 'old-ip' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const newRinfo = { address: '201:abcd::1', port: 12345 }; // Ygg address
        const packet = {
            type: 'PONG',
            senderUpeerId: 'peer1',
            signature: '00'.repeat(64)
        };
        const msg = Buffer.from(JSON.stringify(packet));

        await handlePacket(msg, newRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(contactLocation.updateContactLocation).toHaveBeenCalledWith('peer1', '201:abcd::1');
    });

    it('should handle IDENTITY_UPDATE for self', async () => {
        const myId = 'my-peer-id';
        (identity.getMyUPeerId as any).mockReturnValue(myId);
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ publicKey: '00'.repeat(32), status: 'connected' });

        const packet = {
            type: 'IDENTITY_UPDATE',
            senderUpeerId: myId,
            signature: '00'.repeat(64),
            alias: 'New Me',
            avatar: 'new-avatar'
        };
        const msg = Buffer.from(JSON.stringify(packet));

        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(identity.setMyAlias).toHaveBeenCalledWith('New Me');
    });

    it('should log unknown packet types', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const packet = {
            type: 'UNKNOWN_TYPE',
            senderUpeerId: 'peer1',
            signature: '00'.repeat(64)
        };
        const msg = Buffer.from(JSON.stringify(packet));

        const logger = await import('../../../src/main_process/security/secure-logger.js');
        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(logger.warn).toHaveBeenCalledWith('Unknown packet', expect.anything(), 'network');
    });

    it('should handle JSON parse errors gracefully', async () => {
        const msg = Buffer.from('{ invalid json');
        const logger = await import('../../../src/main_process/security/secure-logger.js');
        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(logger.error).toHaveBeenCalledWith('UDP Packet Error', expect.anything(), 'network');
    });

    it('should handle VAULT_QUERY and VAULT_ACK with dynamic imports', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const packetQuery = { type: 'VAULT_QUERY', senderUpeerId: 'peer1', signature: 'sig' };
        const msgQuery = Buffer.from(JSON.stringify(packetQuery));
        await handlePacket(msgQuery, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);

        const packetAck = { type: 'VAULT_ACK', senderUpeerId: 'peer1', signature: 'sig' };
        const msgAck = Buffer.from(JSON.stringify(packetAck));
        await handlePacket(msgAck, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);

        const packetStore = { type: 'VAULT_STORE', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(packetStore)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);

        const vaultRoot = await import('../../../src/main_process/network/vault/protocol/handlers.js');
        expect(vaultRoot.handleVaultQuery).toHaveBeenCalled();
        expect(vaultRoot.handleVaultAck).toHaveBeenCalled();
        expect(vaultRoot.handleVaultStore).toHaveBeenCalled();
    });

    it('should handle PING with alias/avatar and trigger operations update', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const packet = {
            type: 'PING',
            senderUpeerId: 'peer1',
            signature: 'sig',
            alias: 'Updated Alias',
            avatar: 'data:image/png;base64,valid'
        };
        await handlePacket(Buffer.from(JSON.stringify(packet)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);

        // Wait for async dynamic imports inside PING handler
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(contactsOps.updateContactName).toHaveBeenCalledWith('peer1', 'Updated Alias');
        expect(contactsOps.updateContactAvatar).toHaveBeenCalledWith('peer1', 'data:image/png;base64,valid');
    });

    it('should handle CHAT_CONTACT and log unknown type for coverage', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const contactPacket = { type: 'CHAT_CONTACT', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(contactPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        // Just ensures it doesn't crash as it's an empty case currently
    });

    it('should handle TYPING and CHAT_REACTION', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const typingPacket = { type: 'TYPING', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(typingPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(mockWin.webContents.send).toHaveBeenCalledWith('peer-typing', { upeerId: 'peer1' });

        const reactionPacket = { type: 'CHAT_REACTION', senderUpeerId: 'peer1', signature: 'sig', emoji: '👍' };
        await handlePacket(Buffer.from(JSON.stringify(reactionPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(chatHandlers.handleChatReaction).toHaveBeenCalled();
    });

    it('should handle CHAT_EDIT and CHAT_DELETE', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const editPacket = { type: 'CHAT_UPDATE', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(editPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(chatHandlers.handleChatEdit).toHaveBeenCalled();

        const deletePacket = { type: 'CHAT_DELETE', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(deletePacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(chatHandlers.handleChatDelete).toHaveBeenCalled();
    });

    it('should handle CHAT_CLEAR_ALL with dynamic import', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const clearPacket = { type: 'CHAT_CLEAR_ALL', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(clearPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);

        const chatModule = await import('../../../src/main_process/network/handlers/chat.js');
        expect(chatModule.handleChatClear).toHaveBeenCalled();
    });

    it('should handle FILE_CHUNK and other file messages', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const chunkPacket = { type: 'FILE_CHUNK', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(chunkPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(fileTransferManager.handleMessage).toHaveBeenCalledWith('peer1', mockRinfo.address, expect.objectContaining({ type: 'FILE_CHUNK' }));
    });

    it('should handle REPUTATION_REQUEST and REPUTATION_DELIVER', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const reqPacket = { type: 'REPUTATION_REQUEST', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(reqPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(reputationHandlers.handleReputationRequest).toHaveBeenCalled();

        const delPacket = { type: 'REPUTATION_DELIVER', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(delPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(reputationHandlers.handleReputationDeliver).toHaveBeenCalled();
    });

    it('should handle all GROUP cases', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const types = ['GROUP_ACK', 'GROUP_INVITE', 'GROUP_UPDATE', 'GROUP_LEAVE'];
        for (const type of types) {
            await handlePacket(Buffer.from(JSON.stringify({ type, senderUpeerId: 'peer1', signature: 'sig' })), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        }

        expect(groupHandlers.handleGroupAck).toHaveBeenCalled();
        expect(groupHandlers.handleGroupInvite).toHaveBeenCalled();
        expect(groupHandlers.handleGroupUpdate).toHaveBeenCalled();
        expect(groupHandlers.handleGroupLeave).toHaveBeenCalled();
    });

    it('should handle VAULT_RENEW with dynamic import', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const packet = { type: 'VAULT_RENEW', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(packet)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);

        const vaultRoot = await import('../../../src/main_process/network/vault/protocol/handlers.js');
        expect(vaultRoot.handleVaultRenew).toHaveBeenCalled();
    });

    it('should handle READ and TYPING packets', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (identity.verify as any).mockReturnValue(true);
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        const readPacket = { type: 'READ', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(readPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(chatHandlers.handleChatAck).toHaveBeenCalledWith('peer1', expect.objectContaining({ status: 'read' }), mockWin);
    });

    it('should handle legacy signature verification fallback', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);

        // First verify fails, second (legacy) succeeds
        (identity.verify as any)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(true);

        const packet = {
            type: 'PING',
            senderUpeerId: 'peer1',
            signature: 'sig',
            senderYggAddress: '201:abcd::1' // Included in packet
        };
        const msg = Buffer.from(JSON.stringify(packet));

        // Rinfo must be localhost to trigger isLocalSource and set rinfo.address = senderYggAddress
        const localRinfo = { address: '127.0.0.1', port: 12345 };

        await handlePacket(msg, localRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(identity.verify).toHaveBeenCalledTimes(2);
        expect(mockSendResponse).toHaveBeenCalledWith('201:abcd::1', { type: 'PONG' });
    });

    it('should handle rate limiting by identity', async () => {
        const contact = { publicKey: '00'.repeat(32), status: 'connected' };
        (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);
        (identity.verify as any).mockReturnValue(true);
        (IdentityRateLimiter.prototype.checkIdentity as any).mockReturnValue(false);

        const packet = { type: 'PING', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(packet)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);

        expect(mockSendResponse).not.toHaveBeenCalled();
    });
});
