import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as contactOpsModule from '../../../src/main_process/storage/contacts/operations.js';
import * as groupsOpsModule from '../../../src/main_process/storage/groups/operations.js';
import * as messagesOpsModule from '../../../src/main_process/storage/messages/operations.js';

type GroupRecord = NonNullable<ReturnType<typeof groupsOpsModule.getGroupById>>;
type ContactRecord = NonNullable<Awaited<ReturnType<typeof contactOpsModule.getContactByUpeerId>>>;
type SaveMessageResult = Awaited<ReturnType<typeof messagesOpsModule.saveMessage>>;
type KademliaInstance = import('../../../src/main_process/network/dht/kademlia/main.js').KademliaDHT;

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    deleteGroup: vi.fn(),
    getGroupById: vi.fn(),
    saveGroup: vi.fn(),
    updateGroupCrypto: vi.fn(),
    updateGroupAdmin: vi.fn(),
    updateGroupMembers: vi.fn(),
    updateGroupMemberPublicKeys: vi.fn(),
    updateGroupInfo: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveMessage: vi.fn(),
    deleteMessagesByChatId: vi.fn(),
    updateMessageStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyPublicKeyHex: vi.fn(() => '11'.repeat(32)),
    getUPeerIdFromPublicKey: vi.fn((publicKey: Buffer) => publicKey.toString('hex') === 'aa'.repeat(32) ? 'peer-online' : 'peer-offline'),
    getMySignedPreKey: vi.fn(() => ({ spkPub: '55'.repeat(32), spkSig: '66'.repeat(64), spkId: 13 })),
    getMyUPeerId: vi.fn(() => 'self-id'),
    sign: vi.fn(() => Buffer.from('sig')),
    encrypt: vi.fn(() => ({ ciphertext: 'ciphertext', nonce: 'nonce' })),
    getMyEphemeralPublicKeyHex: vi.fn(() => '22'.repeat(32)),
    incrementEphemeralMessageCounter: vi.fn(),
    getMyIdentitySkBuffer: vi.fn(() => Buffer.alloc(32)),
    getMyPublicKey: vi.fn(() => Buffer.from('11'.repeat(32), 'hex')),
}));

vi.mock('../../../src/main_process/storage/ratchet/operations.js', () => ({
    getRatchetSession: vi.fn(() => null),
    saveRatchetSession: vi.fn(),
}));

vi.mock('electron', () => ({
    BrowserWindow: { getAllWindows: vi.fn(() => [{ webContents: { send: vi.fn() } }]) },
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
    beforeEach(async () => {
        vi.clearAllMocks();
        const { resetEncryptedOperationRetries } = await import('../../../src/main_process/network/messaging/encryptedOperationRetry.js');
        resetEncryptedOperationRetries();
    });

    it('vaults the initial group invite for self so other own devices receive senderKey and epoch', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { createGroup } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(undefined);
        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-new',
            adminUpeerId: 'self-id',
            name: 'Grupo nuevo',
            avatar: null,
            members: ['self-id', 'peer-a'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
            status: 'active'
        } as GroupRecord);

        await createGroup('Grupo nuevo', ['peer-a']);

        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'self-id',
            expect.objectContaining({
                type: 'GROUP_INVITE',
                senderUpeerId: 'self-id',
                ratchetHeader: { dh: '44'.repeat(32), pn: 0, n: 0 },
                x3dhInit: {
                    ekPub: '33'.repeat(32),
                    spkId: 13,
                    ikPub: '11'.repeat(32),
                }
            }),
            undefined,
            expect.any(String)
        );
    });

    it('uses Double Ratchet for offline GROUP_UPDATE delivery when the member has signedPreKey', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const { saveRatchetSession } = await import('../../../src/main_process/storage/ratchet/operations.js');
        const ratchet = await import('../../../src/main_process/security/ratchet.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { updateGroup } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-1',
            adminUpeerId: 'self-id',
            status: 'active',
            members: ['self-id', 'peer-offline'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as GroupRecord);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-offline',
            status: 'disconnected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 9,
        } as unknown as ContactRecord);

        await updateGroup('grp-1', { name: 'Nuevo nombre' });

        expect(ratchet.x3dhInitiator).toHaveBeenCalled();
        expect(ratchet.ratchetEncrypt).toHaveBeenCalled();
        expect(saveRatchetSession).toHaveBeenCalled();
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-offline',
            expect.objectContaining({
                type: 'GROUP_UPDATE',
                ratchetHeader: { dh: '44'.repeat(32), pn: 0, n: 0 },
                x3dhInit: {
                    ekPub: '33'.repeat(32),
                    spkId: 9,
                    ikPub: '11'.repeat(32),
                },
                senderUpeerId: 'self-id'
            }),
            undefined,
            expect.any(String)
        );
    });

    it('uses Double Ratchet for online GROUP_UPDATE delivery', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const ratchet = await import('../../../src/main_process/security/ratchet.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { updateGroup } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValueOnce({
            groupId: 'grp-1',
            adminUpeerId: 'self-id',
            status: 'active',
            members: ['self-id', 'peer-online'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as GroupRecord).mockReturnValueOnce({
            groupId: 'grp-1',
            adminUpeerId: 'self-id',
            status: 'active',
            members: ['self-id', 'peer-online'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as GroupRecord);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 10,
            address: '200::10',
            knownAddresses: '[]'
        } as ContactRecord);

        await updateGroup('grp-1', { name: 'Nuevo nombre' });

        expect(ratchet.ratchetEncrypt).toHaveBeenCalled();
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::10',
            expect.objectContaining({
                type: 'GROUP_UPDATE',
                ratchetHeader: { dh: '44'.repeat(32), pn: 0, n: 0 },
                x3dhInit: {
                    ekPub: '33'.repeat(32),
                    spkId: 10,
                    ikPub: '11'.repeat(32),
                }
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

    it('continues broadcasting GROUP_UPDATE when one member vaulting fails', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const logger = await import('../../../src/main_process/security/secure-logger.js');
        const { updateGroup } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-robust',
            adminUpeerId: 'self-id',
            status: 'active',
            members: ['self-id', 'peer-a', 'peer-b'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as GroupRecord);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-a',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 10,
            address: '200::a',
            knownAddresses: '[]'
        } as ContactRecord);
        vi.mocked(VaultManager.replicateToVaults).mockImplementation(async (upeerId: string) => {
            if (upeerId === 'peer-a') throw new Error('vault-a-failed');
            return 1;
        });

        await expect(updateGroup('grp-robust', { name: 'Robusto' })).resolves.toBeUndefined();

        expect(logger.warn).toHaveBeenCalledWith(
            'Failed to deliver GROUP_UPDATE to member',
            expect.objectContaining({ memberUpeerId: 'peer-a', err: 'Error: vault-a-failed' }),
            'network'
        );
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::a',
            expect.objectContaining({ type: 'GROUP_UPDATE', groupId: 'grp-robust' }),
            'aa'.repeat(32)
        );
    });

    it('does not let a non-admin change group details or membership', async () => {
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const { inviteToGroup, updateGroup } = await import('../../../src/main_process/network/messaging/groups.js');
        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-protected',
            adminUpeerId: 'peer-admin',
            members: ['self-id', 'peer-admin'],
            status: 'active',
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as GroupRecord);

        await updateGroup('grp-protected', { name: 'Cambio no autorizado' });
        await inviteToGroup('grp-protected', 'peer-new');

        expect(groupsOps.updateGroupInfo).not.toHaveBeenCalled();
        expect(groupsOps.updateGroupMembers).not.toHaveBeenCalled();
        expect(groupsOps.updateGroupCrypto).not.toHaveBeenCalled();
    });

    it('requires transferring admin control before an administrator leaves', async () => {
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { leaveGroup } = await import('../../../src/main_process/network/messaging/groups.js');
        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-admin-leave',
            adminUpeerId: 'self-id',
            members: ['self-id', 'peer-a'],
            status: 'active',
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as GroupRecord);
        await expect(leaveGroup('grp-admin-leave')).rejects.toThrow('Transfiere la administración a otro miembro antes de salir');

        expect(groupsOps.updateGroupMembers).not.toHaveBeenCalled();
        expect(groupsOps.updateGroupCrypto).not.toHaveBeenCalled();
        expect(messagesOps.deleteMessagesByChatId).not.toHaveBeenCalled();
        expect(groupsOps.deleteGroup).not.toHaveBeenCalled();
    });

    it('keeps the active conversation when leaving fails before completion', async () => {
        const { createChatOperationActions } = await import('../../../src/store/chatStoreOperations.js');
        const set = vi.fn();
        const refreshGroups = vi.fn();
        const get = vi.fn(() => ({ activeGroupId: 'grp-admin-leave', refreshGroups }));
        const leaveGroup = vi.fn().mockRejectedValue(new Error('delivery failed'));
        vi.stubGlobal('window', { upeer: { leaveGroup } });

        await expect(createChatOperationActions(set as never, get as never).handleLeaveGroup('grp-admin-leave'))
            .rejects.toThrow('delivery failed');

        expect(refreshGroups).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
    });

    it('retries pending encrypted group updates after DR_RESET', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { retryPendingGroupEncryptedOperations } = await import('../../../src/main_process/network/messaging/encryptedOperationRetry.js');
        const { updateGroup } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-1',
            adminUpeerId: 'self-id',
            status: 'active',
            members: ['self-id', 'peer-online'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as GroupRecord);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 11,
            address: '200::10',
            knownAddresses: '[]'
        } as ContactRecord);

        await updateGroup('grp-1', { name: 'Nuevo nombre' });

        vi.mocked(sendSecureUDPMessage).mockClear();

        const retried = await retryPendingGroupEncryptedOperations('peer-online', 'grp-1');

        expect(retried).toBe(1);
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::10',
            expect.objectContaining({ type: 'GROUP_UPDATE', groupId: 'grp-1' }),
            'aa'.repeat(32)
        );
    });

    it('vaults offline member revocation without the rotated sender key', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const groupPayload = await import('../../../src/main_process/network/groupPayload.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { removeGroupMember } = await import('../../../src/main_process/network/messaging/groups.js');
        const payloadSpy = vi.spyOn(groupPayload, 'buildGroupUpdatePayload');
        const group = {
            groupId: 'grp-revoke',
            name: 'Grupo',
            adminUpeerId: 'self-id',
            status: 'active',
            members: ['self-id', 'peer-online', 'peer-offline'],
            epoch: 6,
            senderKey: 'cc'.repeat(32),
            memberPublicKeys: {},
        } as GroupRecord;
        vi.mocked(groupsOps.getGroupById).mockImplementation(() => ({
            ...group,
            members: ['self-id', 'peer-online', 'peer-offline'],
            epoch: 6,
            senderKey: 'cc'.repeat(32),
        }) as GroupRecord);
        vi.mocked(contactsOps.getContactByUpeerId).mockImplementation((upeerId: string) => ({
            upeerId,
            status: upeerId === 'peer-online' ? 'connected' : 'disconnected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 9,
            address: upeerId === 'peer-online' ? '200::10' : undefined,
            knownAddresses: '[]',
        }) as unknown as ContactRecord);

        await removeGroupMember('grp-revoke', 'peer-offline');

        expect(groupsOps.updateGroupMembers).toHaveBeenCalledWith('grp-revoke', ['self-id', 'peer-online']);
        expect(groupsOps.updateGroupCrypto).toHaveBeenCalledWith('grp-revoke', expect.objectContaining({
            epoch: 2,
            senderKey: 'dd'.repeat(32),
        }));
        const remainingDelivery = vi.mocked(VaultManager.replicateToVaults).mock.calls.find(
            ([recipient]) => recipient === 'peer-online',
        );
        const revocationDelivery = vi.mocked(VaultManager.replicateToVaults).mock.calls.find(
            ([recipient]) => recipient === 'peer-offline',
        );
        expect(remainingDelivery).toBeDefined();
        expect(revocationDelivery).toBeDefined();
        expect(payloadSpy).toHaveBeenCalledTimes(2);
        expect(payloadSpy.mock.calls[0][0]).toEqual(expect.objectContaining({
            members: ['self-id', 'peer-online'],
            epoch: 2,
            senderKey: 'dd'.repeat(32),
        }));
        expect(payloadSpy.mock.calls[1][0]).toEqual(expect.objectContaining({
            members: ['self-id', 'peer-online'],
            epoch: 3,
        }));
        expect(payloadSpy.mock.calls[1][0]).not.toHaveProperty('senderKey');
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
            status: 'active',
            members: ['self-id', 'peer-online', 'peer-offline'],
        } as GroupRecord);
        vi.mocked(contactsOps.getContactByUpeerId).mockImplementation((upeerId: string) => {
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
                    publicKey: 'bb'.repeat(32)
                } as unknown as ContactRecord;
            }
            return undefined;
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
            adminUpeerId: 'self-id',
            name: 'Grupo',
            status: 'active',
            members: ['self-id', 'peer-online'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as GroupRecord);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 12,
            address: '200::10',
            knownAddresses: '[]'
        } as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);

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
        const ratchet = await import('../../../src/main_process/security/ratchet.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { inviteToGroup } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValueOnce({
            groupId: 'grp-1',
            adminUpeerId: 'self-id',
            status: 'active',
            name: 'Grupo con avatar',
            avatar: 'data:image/jpeg;base64,avatar',
            members: ['self-id'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as GroupRecord).mockReturnValueOnce({
            groupId: 'grp-1',
            adminUpeerId: 'self-id',
            status: 'active',
            name: 'Grupo con avatar',
            avatar: 'data:image/jpeg;base64,avatar',
            members: ['self-id', 'peer-online'],
            epoch: 2,
            senderKey: 'dd'.repeat(32),
        } as GroupRecord);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 18,
            address: '200::10',
            knownAddresses: '[]'
        } as ContactRecord);

        await inviteToGroup('grp-1', 'peer-online');

        expect(ratchet.ratchetEncrypt).toHaveBeenCalled();
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::10',
            expect.objectContaining({
                type: 'GROUP_INVITE',
                groupId: 'grp-1',
                ratchetHeader: { dh: '44'.repeat(32), pn: 0, n: 0 },
                x3dhInit: {
                    ekPub: '33'.repeat(32),
                    spkId: 18,
                    ikPub: '11'.repeat(32),
                }
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
            adminUpeerId: 'self-id',
            name: 'Grupo',
            status: 'active',
            members: ['self-id', 'online-peer', 'offline-peer'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
            memberPublicKeys: {},
        } as GroupRecord);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(undefined);
        vi.mocked(getKademliaInstance).mockReturnValue({
            findClosestContacts: vi.fn(() => [
                { upeerId: 'self-id', address: '200::other-device' },
                { upeerId: 'self-id', address: '200::self' }
            ])
        } as unknown as KademliaInstance);

        await sendGroupMessage('grp-1', 'hola grupo sync');

        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::other-device',
            expect.objectContaining({ type: 'GROUP_MSG', groupId: 'grp-1' }),
            '11'.repeat(32),
            true
        );
    });

    it('envía un evento de llamada de grupo a miembros conectados y lo vaultea para miembros offline', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendGroupCallEvent } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-call',
            adminUpeerId: 'self-id',
            name: 'Grupo',
            status: 'active',
            members: ['self-id', 'online-peer', 'offline-peer'],
            epoch: 4,
            senderKey: 'cc'.repeat(32),
        } as GroupRecord);
        vi.mocked(contactsOps.getContactByUpeerId).mockImplementation((id) => ({
            upeerId: id,
            publicKey: 'aa'.repeat(32),
            status: id === 'offline-peer' ? 'offline' : 'connected',
            address: `200::${id}`,
        } as ContactRecord));
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(VaultManager.replicateToVaults).mockResolvedValue(1);

        await sendGroupCallEvent('grp-call', '__SYS__|Llamada de voz perdida', 1234, 'call-event-id');

        expect(messagesOps.saveMessage).toHaveBeenCalledWith(
            'call-event-id', 'grp-call', true, '__SYS__|Llamada de voz perdida', undefined, expect.any(String), 'sent', 'self-id', 1234,
        );
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::online-peer', expect.objectContaining({ type: 'GROUP_MSG', id: 'call-event-id', groupId: 'grp-call' }), 'aa'.repeat(32), false,
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'offline-peer', expect.objectContaining({ type: 'GROUP_MSG', id: 'call-event-id', groupId: 'grp-call' }), undefined, expect.any(String),
        );
    });

    it('still sends to primary address when knownAddresses is malformed', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { updateGroup } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValueOnce({
            groupId: 'grp-1',
            adminUpeerId: 'self-id',
            status: 'active',
            members: ['self-id', 'peer-online'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as GroupRecord).mockReturnValueOnce({
            groupId: 'grp-1',
            adminUpeerId: 'self-id',
            status: 'active',
            members: ['self-id', 'peer-online'],
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as GroupRecord);

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 19,
            address: '200::10',
            knownAddresses: 'not-json'
        } as ContactRecord);

        await updateGroup('grp-1', { name: 'Nombre' });

        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::10',
            expect.objectContaining({ type: 'GROUP_UPDATE', groupId: 'grp-1' }),
            'aa'.repeat(32)
        );
    });
});
