import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    deleteGroup: vi.fn(),
    getGroupById: vi.fn(),
    saveGroup: vi.fn(),
    updateGroupCrypto: vi.fn(),
    updateGroupMembers: vi.fn(),
    updateGroupInfo: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveMessage: vi.fn(),
    deleteMessagesByChatId: vi.fn(),
    updateMessageStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyPublicKeyHex: vi.fn(() => '11'.repeat(32)),
    getMyUPeerId: vi.fn(() => 'self-id'),
    sign: vi.fn(() => Buffer.from('sig')),
    encrypt: vi.fn(() => ({ ciphertext: 'ciphertext', nonce: 'nonce' })),
    getMyEphemeralPublicKeyHex: vi.fn(() => '22'.repeat(32)),
    incrementEphemeralMessageCounter: vi.fn(),
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

vi.mock('../../../src/main_process/network/dht/handlers.js', () => ({
    getKademliaInstance: vi.fn(),
}));

vi.mock('../../../src/main_process/sidecars/yggstack.js', () => ({
    getYggstackAddress: vi.fn(() => '200::self'),
}));

vi.mock('../../../src/main_process/network/og-fetcher.js', () => ({
    fetchOgPreview: vi.fn(),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        replicateToVaults: vi.fn(),
    },
}));

vi.mock('../../../src/main_process/network/groupState.js', () => ({
    encryptGroupMessage: vi.fn(() => ({ ciphertext: 'group-ciphertext', nonce: '11'.repeat(24) })),
    generateGroupSenderState: vi.fn(() => ({ epoch: 1, senderKey: 'cc'.repeat(32), senderKeyCreatedAt: 123 })),
    rotateGroupSenderState: vi.fn(() => ({ epoch: 2, senderKey: 'dd'.repeat(32), senderKeyCreatedAt: 456 })),
}));

describe('network/messaging/groups.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('vaults the initial group invite for self so other own devices receive senderKey and epoch', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { createGroup } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(null as any);
        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-new',
            name: 'Grupo nuevo',
            avatar: null,
            members: ['self-id', 'peer-a'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
            status: 'active'
        } as any);

        await createGroup('Grupo nuevo', ['peer-a']);

        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'self-id',
            expect.objectContaining({
                type: 'GROUP_INVITE',
                senderUpeerId: 'self-id',
                useRecipientEphemeral: false
            }),
            undefined,
            expect.any(String)
        );
    });

    it('uses static key for offline GROUP_UPDATE delivery', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const identity = await import('../../../src/main_process/security/identity.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { updateGroup } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-1',
            members: ['self-id', 'peer-offline'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as any);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-offline',
            status: 'disconnected',
            publicKey: 'aa'.repeat(32),
            ephemeralPublicKey: 'bb'.repeat(32),
            ephemeralPublicKeyUpdatedAt: new Date().toISOString(),
        } as any);

        await updateGroup('grp-1', { name: 'Nuevo nombre' });

        expect(identity.encrypt).toHaveBeenCalledWith(
            Buffer.from(JSON.stringify({ groupName: 'Nuevo nombre' }), 'utf-8'),
            Buffer.from('aa'.repeat(32), 'hex')
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-offline',
            expect.objectContaining({
                type: 'GROUP_UPDATE',
                useRecipientEphemeral: false,
                senderUpeerId: 'self-id'
            }),
            undefined,
            expect.any(String)
        );
    });

    it('uses recipient ephemeral key for online GROUP_UPDATE delivery', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const identity = await import('../../../src/main_process/security/identity.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { updateGroup } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValueOnce({
            groupId: 'grp-1',
            members: ['self-id', 'peer-online'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as any).mockReturnValueOnce({
            groupId: 'grp-1',
            members: ['self-id', 'peer-online'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as any);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            ephemeralPublicKey: 'bb'.repeat(32),
            ephemeralPublicKeyUpdatedAt: new Date().toISOString(),
            address: '200::10',
            knownAddresses: '[]'
        } as any);

        await updateGroup('grp-1', { name: 'Nuevo nombre' });

        expect(identity.encrypt).toHaveBeenCalledWith(
            Buffer.from(JSON.stringify({ groupName: 'Nuevo nombre' }), 'utf-8'),
            Buffer.from('bb'.repeat(32), 'hex')
        );
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::10',
            expect.objectContaining({
                type: 'GROUP_UPDATE',
                useRecipientEphemeral: true,
                ephemeralPublicKey: '22'.repeat(32)
            }),
            'aa'.repeat(32)
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-online',
            expect.objectContaining({
                type: 'GROUP_UPDATE',
                groupId: 'grp-1',
                senderUpeerId: 'self-id'
            }),
            undefined,
            expect.any(String)
        );
    });

    it('vaults GROUP_LEAVE for own devices and offline members', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { leaveGroup } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-1',
            members: ['self-id', 'peer-online', 'peer-offline'],
        } as any);
        vi.mocked(contactsOps.getContactByUpeerId).mockImplementation(async (upeerId: string) => {
            if (upeerId === 'peer-online') {
                return {
                    upeerId,
                    status: 'connected',
                    publicKey: 'aa'.repeat(32),
                    address: '200::10',
                    knownAddresses: '[]'
                } as any;
            }
            if (upeerId === 'peer-offline') {
                return {
                    upeerId,
                    status: 'disconnected',
                    publicKey: 'bb'.repeat(32)
                } as any;
            }
            return null as any;
        });

        await leaveGroup('grp-1');

        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::10',
            expect.objectContaining({
                type: 'GROUP_LEAVE',
                senderUpeerId: 'self-id',
                signature: expect.any(String)
            }),
            'aa'.repeat(32)
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'self-id',
            expect.objectContaining({
                type: 'GROUP_LEAVE',
                senderUpeerId: 'self-id',
                signature: expect.any(String)
            }),
            undefined,
            expect.any(String)
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-offline',
            expect.objectContaining({
                type: 'GROUP_LEAVE',
                senderUpeerId: 'self-id',
                signature: expect.any(String)
            }),
            undefined,
            expect.any(String)
        );
        expect(messagesOps.deleteMessagesByChatId).toHaveBeenCalledWith('grp-1');
        expect(groupsOps.deleteGroup).toHaveBeenCalledWith('grp-1');
    });

    it('serializes a provided link preview for group messages without refetching', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { fetchOgPreview } = await import('../../../src/main_process/network/og-fetcher.js');
        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-1',
            name: 'Grupo',
            status: 'active',
            members: ['self-id', 'peer-online'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as any);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            address: '200::10',
            knownAddresses: '[]'
        } as any);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as any);

        const preview = {
            url: 'https://example.com',
            title: 'Example',
            description: 'Preview',
            domain: 'example.com'
        };

        const result = await sendGroupMessage('grp-1', 'mira https://example.com', undefined, preview);

        expect(fetchOgPreview).not.toHaveBeenCalled();
        expect(result).toEqual(expect.objectContaining({
            savedMessage: JSON.stringify({ text: 'mira https://example.com', linkPreview: preview })
        }));
        expect(messagesOps.saveMessage).toHaveBeenCalledWith(
            expect.any(String),
            'grp-1',
            true,
            JSON.stringify({ text: 'mira https://example.com', linkPreview: preview }),
            undefined,
            expect.any(String),
            'sent',
            'self-id',
            expect.any(Number)
        );
    });

    it('includes the group avatar when inviting a member to an existing group', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const identity = await import('../../../src/main_process/security/identity.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { inviteToGroup } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValueOnce({
            groupId: 'grp-1',
            name: 'Grupo con avatar',
            avatar: 'data:image/jpeg;base64,avatar',
            members: ['self-id', 'peer-online'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as any).mockReturnValueOnce({
            groupId: 'grp-1',
            name: 'Grupo con avatar',
            avatar: 'data:image/jpeg;base64,avatar',
            members: ['self-id', 'peer-online'],
            epoch: 2,
            senderKey: 'dd'.repeat(32),
        } as any);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            address: '200::10',
            knownAddresses: '[]'
        } as any);

        await inviteToGroup('grp-1', 'peer-online');

        expect(identity.encrypt).toHaveBeenCalledWith(
            Buffer.from(JSON.stringify({
                groupName: 'Grupo con avatar',
                members: ['self-id', 'peer-online'],
                epoch: 2,
                senderKey: 'dd'.repeat(32),
                avatar: 'data:image/jpeg;base64,avatar'
            }), 'utf-8'),
            Buffer.from('aa'.repeat(32), 'hex')
        );
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::10',
            expect.objectContaining({
                type: 'GROUP_INVITE',
                groupId: 'grp-1'
            }),
            'aa'.repeat(32)
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-online',
            expect.objectContaining({
                type: 'GROUP_INVITE',
                groupId: 'grp-1',
                senderUpeerId: 'self-id'
            }),
            undefined,
            expect.any(String)
        );
    });

    it('self-syncs group messages without requiring a self contact record', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/handlers.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-1',
            name: 'Grupo',
            status: 'active',
            members: ['self-id'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as any);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(null as any);
        (getKademliaInstance as any).mockReturnValue({
            findClosestContacts: vi.fn(() => [
                { upeerId: 'self-id', address: '200::other-device' },
                { upeerId: 'self-id', address: '200::self' }
            ])
        } as any);

        await sendGroupMessage('grp-1', 'hola grupo sync');

        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::other-device',
            expect.objectContaining({ type: 'GROUP_MSG', groupId: 'grp-1' }),
            '11'.repeat(32),
            true
        );
    });

    it('still sends to primary address when knownAddresses is malformed', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { updateGroup } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValueOnce({
            groupId: 'grp-1',
            members: ['self-id', 'peer-online'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as any).mockReturnValueOnce({
            groupId: 'grp-1',
            members: ['self-id', 'peer-online'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as any);

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            address: '200::10',
            knownAddresses: 'not-json'
        } as any);

        await updateGroup('grp-1', { name: 'Nombre' });

        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::10',
            expect.objectContaining({ type: 'GROUP_UPDATE', groupId: 'grp-1' }),
            'aa'.repeat(32)
        );
    });
});
