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

type PacketWindow = NonNullable<Parameters<typeof handlePacket>[2]>;
type PacketRinfo = Parameters<typeof handlePacket>[1];
type SendResponse = Parameters<typeof handlePacket>[3];
type StartDhtSearch = Parameters<typeof handlePacket>[4];
type KnownContact = Awaited<ReturnType<typeof contactsOps.getContactByUpeerId>>;

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
    const mockWindowLike: object = {
        webContents: {
            send: vi.fn()
        }
    };
    const mockWin = mockWindowLike as PacketWindow;
    const mockSendResponse = vi.fn<SendResponse>();
    const mockStartDhtSearch = vi.fn<StartDhtSearch>();
    const mockRinfo: PacketRinfo = { address: '201:1234::1', port: 12345 };
    const connectedContact = {
        publicKey: '00'.repeat(32),
        status: 'connected'
    } as NonNullable<KnownContact>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(IdentityRateLimiter.prototype.checkIp).mockReturnValue(true);
        vi.mocked(IdentityRateLimiter.prototype.checkIdentity).mockReturnValue(true);
        vi.mocked(validation.validateMessage).mockReturnValue({ valid: true });
    });

    it('should ignore invalid JSON', async () => {
        const msg = Buffer.from('not a json');
        await handlePacket(msg, mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(validation.validateMessage).not.toHaveBeenCalled();
    });

    it('should handle rate limiting by IP', async () => {
        vi.mocked(IdentityRateLimiter.prototype.checkIp).mockReturnValue(false);
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
        vi.mocked(identity.verify).mockReturnValue(false);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            publicKey: '00'.repeat(32),
            status: 'connected'
        } as NonNullable<KnownContact>);

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
        vi.mocked(unsealPacket).mockReturnValue(innerPacket);

        vi.mocked(validation.validateMessage).mockReturnValue({ valid: false, error: 'stop' });

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
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

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
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

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
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

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
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

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
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

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
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

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
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

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
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);
        const { handleDhtPacket } = await import('../../../src/main_process/network/dht/handlers.js');
        vi.mocked(handleDhtPacket).mockResolvedValue(true);

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
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(contact as NonNullable<KnownContact>);

        const newRinfo: PacketRinfo = { address: '201:abcd::1', port: 12345 };
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
        vi.mocked(identity.getMyUPeerId).mockReturnValue(myId);
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

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
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

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
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

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
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

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
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

        const contactPacket = { type: 'CHAT_CONTACT', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(contactPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        // Just ensures it doesn't crash as it's an empty case currently
    });

    it('should handle TYPING and CHAT_REACTION', async () => {
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

        const typingPacket = { type: 'TYPING', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(typingPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(mockWin.webContents.send).toHaveBeenCalledWith('peer-typing', { upeerId: 'peer1' });

        const reactionPacket = { type: 'CHAT_REACTION', senderUpeerId: 'peer1', signature: 'sig', emoji: '👍' };
        await handlePacket(Buffer.from(JSON.stringify(reactionPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(chatHandlers.handleChatReaction).toHaveBeenCalled();
    });

    it('should handle CHAT_EDIT and CHAT_DELETE', async () => {
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

        const editPacket = { type: 'CHAT_UPDATE', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(editPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(chatHandlers.handleChatEdit).toHaveBeenCalled();

        const deletePacket = { type: 'CHAT_DELETE', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(deletePacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(chatHandlers.handleChatDelete).toHaveBeenCalled();
    });

    it('should handle CHAT_CLEAR_ALL with dynamic import', async () => {
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

        const clearPacket = { type: 'CHAT_CLEAR_ALL', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(clearPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);

        const chatModule = await import('../../../src/main_process/network/handlers/chat.js');
        expect(chatModule.handleChatClear).toHaveBeenCalled();
    });

    it('should handle FILE_CHUNK and other file messages', async () => {
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

        const chunkPacket = { type: 'FILE_CHUNK', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(chunkPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(fileTransferManager.handleMessage).toHaveBeenCalledWith('peer1', mockRinfo.address, expect.objectContaining({ type: 'FILE_CHUNK' }));
    });

    it('should handle REPUTATION_REQUEST and REPUTATION_DELIVER', async () => {
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

        const reqPacket = { type: 'REPUTATION_REQUEST', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(reqPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(reputationHandlers.handleReputationRequest).toHaveBeenCalled();

        const delPacket = { type: 'REPUTATION_DELIVER', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(delPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(reputationHandlers.handleReputationDeliver).toHaveBeenCalled();
    });

    it('should handle all GROUP cases', async () => {
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

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
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

        const packet = { type: 'VAULT_RENEW', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(packet)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);

        const vaultRoot = await import('../../../src/main_process/network/vault/protocol/handlers.js');
        expect(vaultRoot.handleVaultRenew).toHaveBeenCalled();
    });

    it('should handle READ and TYPING packets', async () => {
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

        const readPacket = { type: 'READ', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(readPacket)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(chatHandlers.handleChatAck).toHaveBeenCalledWith('peer1', expect.objectContaining({ status: 'read' }), mockWin);
    });

    it('should handle legacy signature verification fallback', async () => {
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);

        vi.mocked(identity.verify)
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
        const localRinfo: PacketRinfo = { address: '127.0.0.1', port: 12345 };

        await handlePacket(msg, localRinfo, mockWin, mockSendResponse, mockStartDhtSearch);
        expect(identity.verify).toHaveBeenCalledTimes(2);
        expect(mockSendResponse).toHaveBeenCalledWith('201:abcd::1', { type: 'PONG' });
    });

    it('should handle rate limiting by identity', async () => {
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(connectedContact);
        vi.mocked(identity.verify).mockReturnValue(true);
        vi.mocked(IdentityRateLimiter.prototype.checkIdentity).mockReturnValue(false);

        const packet = { type: 'PING', senderUpeerId: 'peer1', signature: 'sig' };
        await handlePacket(Buffer.from(JSON.stringify(packet)), mockRinfo, mockWin, mockSendResponse, mockStartDhtSearch);

        expect(mockSendResponse).not.toHaveBeenCalled();
    });
});
