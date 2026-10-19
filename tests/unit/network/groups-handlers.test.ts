import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    handleGroupMessage,
    handleGroupInvite,
    handleGroupUpdate,
    handleGroupAck,
    handleGroupLeave
} from '../../../src/main_process/network/handlers/groups.js';
import * as groupsOps from '../../../src/main_process/storage/groups/operations.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations.js';
import * as messagesOps from '../../../src/main_process/storage/messages/operations.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as groupControlShared from '../../../src/main_process/network/handlers/groupControlShared.js';

type GroupWindow = NonNullable<Parameters<typeof handleGroupMessage>[3]>;
type GroupContact = Parameters<typeof handleGroupMessage>[1];
type GroupMessageData = Parameters<typeof handleGroupMessage>[2];
type GroupInviteData = Parameters<typeof handleGroupInvite>[1];
type GroupUpdateData = Parameters<typeof handleGroupUpdate>[1];
type GroupAckData = Parameters<typeof handleGroupAck>[1];
type GroupLeaveData = Parameters<typeof handleGroupLeave>[1];

function makeGroup(overrides: Partial<import('../../../src/main_process/storage/groups/operations.js').GroupRecord> & { groupId: string }): import('../../../src/main_process/storage/groups/operations.js').GroupRecord {
    return {
        name: overrides.name ?? '',
        adminUpeerId: overrides.adminUpeerId ?? '',
        members: overrides.members ?? [],
        status: overrides.status ?? 'active',
        epoch: overrides.epoch ?? 1,
        ...overrides,
    };
}

// Mocks
vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    deleteGroup: vi.fn(),
    getGroupById: vi.fn(),
    saveGroup: vi.fn(),
    updateGroupCrypto: vi.fn(),
    updateGroupInfo: vi.fn(),
    updateGroupMemberPublicKeys: vi.fn(),
    updateGroupMembers: vi.fn(),
    updateGroupStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/keys.js', () => ({
    updateContactEphemeralPublicKey: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    deleteMessagesByChatId: vi.fn(),
    saveMessage: vi.fn(),
    updateMessageStatus: vi.fn(),
    getMessageById: vi.fn(),
}));

vi.mock('../../../src/main_process/network/messaging/groupControl.js', () => ({
    rotateGroupAfterMemberRemoval: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    decrypt: vi.fn(),
    decryptWithIdentityKey: vi.fn(),
    getMyPublicKeyHex: vi.fn().mockReturnValue('a'.repeat(64)),
    getMyIdentitySkBuffer: vi.fn(() => Buffer.alloc(32)),
    getMySignedPreKeyBundle: vi.fn(() => ({ spkPub: 'ab'.repeat(32), spkSig: 'cd'.repeat(64), spkId: 7 })),
    getSpkBySpkId: vi.fn(),
    verify: vi.fn(),
    getUPeerIdFromPublicKey: vi.fn((publicKey: Buffer) => publicKey.toString('hex').startsWith('a')
        ? 'sender-upeer-id'
        : publicKey.toString('hex').startsWith('b') ? 'my-id' : 'unknown-member'),
    getMyUPeerId: vi.fn().mockReturnValue('my-id'),
}));

vi.mock('../../../src/main_process/security/ratchet.js', () => ({
    x3dhResponder: vi.fn(),
    ratchetInitBob: vi.fn(),
    ratchetDecrypt: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/ratchet/operations.js', () => ({
    getRatchetSession: vi.fn(() => null),
    saveRatchetSession: vi.fn(),
    deleteRatchetSession: vi.fn(),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    issueVouch: vi.fn().mockResolvedValue(true),
    VouchType: { MALICIOUS: 'MALICIOUS' }
}));

vi.mock('../../../src/main_process/core/windowManager.js', () => ({
    getMainWindow: vi.fn(() => null),
}));

vi.mock('../../../src/main_process/utils/desktopNotification.js', () => ({
    showDesktopNotification: vi.fn(),
}));

vi.mock('../../../src/main_process/utils/windowFocus.js', () => ({
    focusWindow: vi.fn(),
}));

vi.mock('../../../src/main_process/network/groupState.js', () => ({
    decryptGroupMessage: vi.fn(() => 'hola grupo'),
    isValidGroupEpoch: vi.fn((epoch: number) => Number.isInteger(epoch) && epoch > 0),
    isValidGroupSenderKey: vi.fn((senderKey: string) => typeof senderKey === 'string' && senderKey.length === 64),
}));

vi.mock('../../../src/main_process/network/handlers/groupControlShared.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/main_process/network/handlers/groupControlShared.js')>();
    return {
        ...actual,
        decryptGroupControlPayload: vi.fn(),
        updateGroupEphemeralKeyIfValid: vi.fn(),
    };
});

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: vi.fn(),
}));

describe('Group Handlers Final Coverage', () => {
    const mockWin = { webContents: { send: vi.fn() } } as unknown as GroupWindow;
    const groupId = 'group-uuid-123';
    const senderId = 'sender-upeer-id';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleGroupMessage', () => {
        it('should process valid group message', async () => {
            const group = makeGroup({ groupId, members: [senderId, 'my-id'], adminUpeerId: 'admin', epoch: 1, senderKey: 'c'.repeat(64) });
            const data: GroupMessageData = { id: '550e8400-e29b-41d4-a716-446655440000', groupId, content: 'hi', nonce: '11'.repeat(24), epoch: 1, timestamp: 1710000000000 };
            vi.mocked(groupsOps.getGroupById).mockReturnValue(group);
            vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

            await handleGroupMessage(senderId, { upeerId: senderId } as GroupContact, data, mockWin);

            expect(messagesOps.saveMessage).toHaveBeenCalledWith(
                data.id,
                groupId,
                false,
                'hola grupo',
                undefined,
                undefined,
                'delivered',
                senderId,
                data.timestamp
            );
            expect(mockWin.webContents.send).toHaveBeenCalledWith('receive-group-message', expect.objectContaining({
                id: data.id,
                timestamp: data.timestamp
            }));
        });

        it('should decrypt using stored group sender key', async () => {
            const group = makeGroup({ groupId, members: [senderId, 'my-id'], adminUpeerId: 'admin', epoch: 4, senderKey: 'c'.repeat(64) });
            const data: GroupMessageData = {
                id: '550e8400-e29b-41d4-a716-446655440000',
                groupId,
                content: 'aa',
                nonce: '11'.repeat(24),
                epoch: 4,
                timestamp: 1710000000000
            };
            vi.mocked(groupsOps.getGroupById).mockReturnValue(group);
            vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

            await handleGroupMessage(senderId, { upeerId: senderId, publicKey: 'b'.repeat(64) } as GroupContact, data, mockWin);

            expect(messagesOps.saveMessage).toHaveBeenCalledWith(
                data.id,
                groupId,
                false,
                'hola grupo',
                undefined,
                undefined,
                'delivered',
                senderId,
                data.timestamp
            );
        });

        it('should fail if groupId or content is missing', async () => {
            const group = makeGroup({ groupId, members: [senderId], epoch: 1, senderKey: 'c'.repeat(64) });
            vi.mocked(groupsOps.getGroupById).mockReturnValue(group);
            await handleGroupMessage(senderId, { upeerId: senderId } as GroupContact, { groupId } as GroupMessageData, mockWin);
            expect(messagesOps.saveMessage).not.toHaveBeenCalled();
        });

        it('should save self-synced group messages as mine', async () => {
            const myId = 'my-id';
            const group = makeGroup({ groupId, members: [senderId, myId], adminUpeerId: 'admin', epoch: 1, senderKey: 'c'.repeat(64) });
            const data: GroupMessageData = { id: '550e8400-e29b-41d4-a716-446655440001', groupId, content: 'hi', nonce: '11'.repeat(24), epoch: 1, timestamp: 1710000000001, isInternalSync: true };
            vi.mocked(identity.getMyUPeerId).mockReturnValue(myId);
            vi.mocked(groupsOps.getGroupById).mockReturnValue(group);
            vi.mocked(messagesOps.getMessageById).mockResolvedValue(undefined);
            vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

            await handleGroupMessage(myId, { upeerId: myId, name: 'Yo' } as GroupContact, data, mockWin);

            expect(messagesOps.saveMessage).toHaveBeenCalledWith(
                data.id,
                groupId,
                true,
                'hola grupo',
                undefined,
                undefined,
                'read',
                myId,
                data.timestamp
            );
            expect(mockWin.webContents.send).toHaveBeenCalledWith('receive-group-message', expect.objectContaining({
                id: data.id,
                isMine: true,
                status: 'read'
            }));
        });

        it('does not overwrite or re-emit an existing group message when replayed ciphertext differs', async () => {
            const messageId = '550e8400-e29b-41d4-a716-446655440009';
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({
                groupId,
                members: [senderId, 'my-id'],
                epoch: 1,
                senderKey: 'c'.repeat(64),
            }));
            vi.mocked(messagesOps.getMessageById).mockResolvedValue({
                id: messageId,
                chatUpeerId: groupId,
                message: 'hola grupo',
                isMine: 0,
            } as never);

            await handleGroupMessage(senderId, { upeerId: senderId } as GroupContact, {
                id: messageId,
                groupId,
                content: 'different-ciphertext',
                nonce: '11'.repeat(24),
                epoch: 1,
            }, mockWin);

            expect(messagesOps.saveMessage).not.toHaveBeenCalled();
            expect(mockWin.webContents.send).not.toHaveBeenCalledWith('receive-group-message', expect.anything());
            const transport = await import('../../../src/main_process/network/server/transport.js');
            expect(transport.sendSecureUDPMessage).not.toHaveBeenCalled();
        });

        it('rejects a group message ID already stored in another conversation', async () => {
            const messageId = '550e8400-e29b-41d4-a716-446655440010';
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({
                groupId,
                members: [senderId, 'my-id'],
                epoch: 1,
                senderKey: 'c'.repeat(64),
            }));
            vi.mocked(messagesOps.getMessageById).mockResolvedValue({
                id: messageId,
                chatUpeerId: 'another-group',
                message: 'unrelated plaintext',
                isMine: 0,
            } as never);

            await handleGroupMessage(senderId, { upeerId: senderId } as GroupContact, {
                id: messageId,
                groupId,
                content: 'replayed-ciphertext',
                nonce: '11'.repeat(24),
                epoch: 1,
            }, mockWin);

            expect(messagesOps.saveMessage).not.toHaveBeenCalled();
            expect(mockWin.webContents.send).not.toHaveBeenCalledWith('receive-group-message', expect.anything());
        });

        it('ACKs an identical message replay without writing or notifying twice', async () => {
            const messageId = '550e8400-e29b-41d4-a716-446655440011';
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({
                groupId,
                members: [senderId, 'my-id'],
                epoch: 1,
                senderKey: 'c'.repeat(64),
            }));
            vi.mocked(messagesOps.getMessageById).mockResolvedValue({
                id: messageId,
                chatUpeerId: groupId,
                message: 'hola grupo',
                isMine: 0,
            } as never);
            const transport = await import('../../../src/main_process/network/server/transport.js');

            await handleGroupMessage(senderId, { upeerId: senderId, address: '200::sender' } as GroupContact, {
                id: messageId,
                groupId,
                content: 'valid-ciphertext',
                nonce: '11'.repeat(24),
                epoch: 1,
            }, mockWin, '200::sender');

            expect(messagesOps.saveMessage).not.toHaveBeenCalled();
            expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith('200::sender', {
                type: 'GROUP_ACK',
                id: messageId,
                groupId,
            });
            expect(mockWin.webContents.send).not.toHaveBeenCalledWith('receive-group-message', expect.anything());
        });
    });

    describe('handleGroupInvite', () => {
        it('should reject legacy encrypted group invites', async () => {
            vi.mocked(groupsOps.getGroupById).mockReturnValue(null);
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'b'.repeat(64), name: 'Alice' } as never);

            await handleGroupInvite(senderId, {
                groupId,
                payload: 'aa',
                nonce: 'bb',
                ephemeralPublicKey: 'a'.repeat(64)
            } as GroupInviteData, mockWin);

            expect(groupControlShared.updateGroupEphemeralKeyIfValid).toHaveBeenCalledWith(senderId, 'a'.repeat(64));
            expect(identity.decrypt).not.toHaveBeenCalled();
            expect(groupsOps.saveGroup).not.toHaveBeenCalled();
        });

        it('should fail if decryption fails', async () => {
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'pub' } as never);
            vi.mocked(identity.decrypt).mockReturnValue(null);
            vi.mocked(identity.decryptWithIdentityKey).mockReturnValue(null);

            await handleGroupInvite(senderId, { groupId, payload: 'hex', nonce: 'hex' } as GroupInviteData, mockWin);
            expect(groupsOps.saveGroup).not.toHaveBeenCalled();
        });

        it('should reject static-recipient legacy group invites', async () => {
            vi.mocked(groupsOps.getGroupById).mockReturnValue(null);
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'b'.repeat(64), name: 'Alice' } as never);

            await handleGroupInvite(senderId, {
                groupId,
                payload: 'aa',
                nonce: 'bb',
                ephemeralPublicKey: 'a'.repeat(64),
                useRecipientEphemeral: false,
            } as GroupInviteData, mockWin);

            expect(identity.decryptWithIdentityKey).not.toHaveBeenCalled();
            expect(groupsOps.saveGroup).not.toHaveBeenCalled();
        });

        it('should decrypt Double Ratchet group invites when a session already exists', async () => {
            const ratchet = await import('../../../src/main_process/security/ratchet.js');
            const ratchetOps = await import('../../../src/main_process/storage/ratchet/operations.js');
            const innerPayload = JSON.stringify({ groupName: 'DR Group', members: [senderId, 'my-id'], epoch: 1, senderKey: 'c'.repeat(64) });
            vi.mocked(groupControlShared.decryptGroupControlPayload).mockResolvedValue(JSON.parse(innerPayload));
            vi.mocked(ratchetOps.getRatchetSession).mockReturnValue({ state: {} as never, spkIdUsed: 3 } as never);
            vi.mocked(ratchet.ratchetDecrypt).mockReturnValue(Buffer.from(innerPayload));
            vi.mocked(groupsOps.getGroupById).mockReturnValue(null);
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'b'.repeat(64), name: 'Alice' } as never);
            vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

            await handleGroupInvite(senderId, {
                groupId,
                payload: 'a'.repeat(32),
                nonce: 'b'.repeat(48),
                ratchetHeader: { dh: 'c'.repeat(64), pn: 0, n: 1 },
            } as GroupInviteData, mockWin);

            expect(groupControlShared.decryptGroupControlPayload).toHaveBeenCalledWith(senderId, expect.objectContaining({ groupId } ), expect.any(Function));
            expect(groupsOps.saveGroup).toHaveBeenCalledWith(
                groupId,
                'DR Group',
                senderId,
                [senderId, 'my-id'],
                'active',
                undefined,
                expect.objectContaining({ epoch: 1, senderKey: 'c'.repeat(64) }),
                {}
            );
        });


        it('should reject invite updates for existing groups from non-admin members', async () => {
            const innerPayload = JSON.stringify({ groupName: 'Test Group', members: [senderId, 'my-id'], epoch: 2, senderKey: 'c'.repeat(64) });
            vi.mocked(identity.decrypt).mockReturnValue(Buffer.from(innerPayload));
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({
                groupId,
                members: [senderId, 'my-id'],
                memberPublicKeys: {},
                adminUpeerId: 'actual-admin',
                epoch: 1,
                senderKey: 'd'.repeat(64)
            }));
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'b'.repeat(64), name: 'Mallory' } as never);

            await handleGroupInvite(senderId, {
                groupId,
                adminUpeerId: senderId,
                payload: 'aa',
                nonce: 'bb'
            } as GroupInviteData, mockWin);

            expect(groupsOps.updateGroupMembers).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupInfo).not.toHaveBeenCalled();
        });

        it('should ignore duplicate invite with same epoch and sender key', async () => {
            const innerPayload = JSON.stringify({ groupName: 'Test Group', members: [senderId, 'my-id'], epoch: 2, senderKey: 'c'.repeat(64) });
            vi.mocked(groupControlShared.decryptGroupControlPayload).mockResolvedValue(JSON.parse(innerPayload));
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({
                groupId,
                name: 'Test Group',
                members: [senderId, 'my-id'],
                adminUpeerId: senderId,
                epoch: 2,
                senderKey: 'c'.repeat(64)
            }));
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'b'.repeat(64), name: 'Alice' } as never);

            await handleGroupInvite(senderId, {
                groupId,
                adminUpeerId: senderId,
                payload: 'aa',
                nonce: 'bb'
            } as GroupInviteData, mockWin);

            expect(groupsOps.updateGroupMembers).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupCrypto).not.toHaveBeenCalled();
            expect(mockWin.webContents.send).not.toHaveBeenCalledWith('group-invite-received', expect.anything());
        });

        it('rejoins a removed group only from its current admin at a newer epoch', async () => {
            const epoch = 4;
            const senderKey = 'e'.repeat(64);
            vi.mocked(groupControlShared.decryptGroupControlPayload).mockResolvedValue({
                groupName: 'Test Group',
                members: [senderId, 'my-id', 'other-member'],
                epoch,
                senderKey,
            });
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({
                groupId,
                name: 'Test Group',
                adminUpeerId: senderId,
                members: [senderId, 'other-member'],
                status: 'removed',
                epoch: 3,
                senderKey: 'd'.repeat(64),
            }));
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'b'.repeat(64), name: 'Alice' } as never);

            await handleGroupInvite(senderId, {
                groupId,
                adminUpeerId: senderId,
                payload: 'aa',
                nonce: 'bb',
            } as GroupInviteData, mockWin);

            expect(groupsOps.updateGroupMembers).toHaveBeenCalledWith(groupId, [senderId, 'my-id', 'other-member']);
            expect(groupsOps.updateGroupCrypto).toHaveBeenCalledWith(groupId, expect.objectContaining({ epoch, senderKey }));
            expect(groupsOps.updateGroupStatus).toHaveBeenCalledWith(groupId, 'active');
        });

        it.each([
            { title: 'the old epoch', epoch: 3, adminUpeerId: senderId, members: [senderId, 'my-id'] },
            { title: 'an unknown administrator', epoch: 4, adminUpeerId: 'other-admin', members: ['other-admin', 'my-id'] },
            { title: 'an administrator no longer in the group', epoch: 4, adminUpeerId: senderId, members: ['my-id'] },
        ])('does not rejoin a removed group from $title', async ({ epoch, adminUpeerId, members }) => {
            vi.mocked(groupControlShared.decryptGroupControlPayload).mockResolvedValue({
                groupName: 'Test Group',
                members,
                epoch,
                senderKey: 'e'.repeat(64),
            });
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({
                groupId,
                adminUpeerId: senderId,
                members: [senderId, 'other-member'],
                status: 'removed',
                epoch: 3,
                senderKey: 'd'.repeat(64),
            }));
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'b'.repeat(64), name: 'Alice' } as never);

            await handleGroupInvite(senderId, {
                groupId,
                adminUpeerId,
                payload: 'aa',
                nonce: 'bb',
            } as GroupInviteData, mockWin);

            expect(groupsOps.updateGroupMembers).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupCrypto).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupStatus).not.toHaveBeenCalled();
        });

        it('rejects a stale invite that would roll back the sender epoch and key', async () => {
            const olderPayload = JSON.stringify({
                groupName: 'Old name',
                members: [senderId, 'my-id'],
                epoch: 1,
                senderKey: 'd'.repeat(64),
            });
            vi.mocked(groupControlShared.decryptGroupControlPayload).mockResolvedValue(JSON.parse(olderPayload));
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({
                groupId,
                name: 'Current name',
                members: [senderId, 'my-id'],
                adminUpeerId: senderId,
                epoch: 2,
                senderKey: 'c'.repeat(64),
            }));
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'b'.repeat(64), name: 'Alice' } as never);

            await handleGroupInvite(senderId, {
                groupId,
                adminUpeerId: senderId,
                payload: 'aa',
                nonce: 'bb',
            } as GroupInviteData, mockWin);

            expect(groupsOps.updateGroupCrypto).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupMembers).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupInfo).not.toHaveBeenCalled();
        });

        it('rejects conflicting sender keys for an already installed invite epoch', async () => {
            const conflictingPayload = JSON.stringify({
                groupName: 'Test Group',
                members: [senderId, 'my-id'],
                epoch: 2,
                senderKey: 'd'.repeat(64),
            });
            vi.mocked(groupControlShared.decryptGroupControlPayload).mockResolvedValue(JSON.parse(conflictingPayload));
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({
                groupId,
                name: 'Test Group',
                members: [senderId, 'my-id'],
                adminUpeerId: senderId,
                epoch: 2,
                senderKey: 'c'.repeat(64),
            }));
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'b'.repeat(64), name: 'Alice' } as never);

            await handleGroupInvite(senderId, {
                groupId,
                adminUpeerId: senderId,
                payload: 'aa',
                nonce: 'bb',
            } as GroupInviteData, mockWin);

            expect(groupsOps.updateGroupCrypto).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupMembers).not.toHaveBeenCalled();
        });

        it('stores member public keys from an admin-authenticated invite', async () => {
            const ratchet = await import('../../../src/main_process/security/ratchet.js');
            const ratchetOps = await import('../../../src/main_process/storage/ratchet/operations.js');
            vi.mocked(groupsOps.getGroupById).mockReturnValue(null);
            const innerPayload = JSON.stringify({
                groupName: 'Grupo test',
                members: [senderId, 'my-id', 'unknown-member'],
                memberPublicKeys: {
                    [senderId]: 'a'.repeat(64),
                    'my-id': 'b'.repeat(64),
                    'unknown-member': 'c'.repeat(64),
                    outsider: 'd'.repeat(64),
                },
                epoch: 1,
                senderKey: 'c'.repeat(64),
            });
            vi.mocked(groupControlShared.decryptGroupControlPayload).mockResolvedValue(JSON.parse(innerPayload));
            vi.mocked(ratchetOps.getRatchetSession).mockReturnValue({ state: {} as never, spkIdUsed: 3 } as never);
            vi.mocked(ratchet.ratchetDecrypt).mockReturnValue(Buffer.from(innerPayload));
            vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

            await handleGroupInvite(senderId, {
                groupId,
                adminUpeerId: senderId,
                payload: 'packet',
                nonce: 'nonce',
                ratchetHeader: { dh: 'd'.repeat(64), pn: 0, n: 1 },
            } as GroupInviteData, mockWin);

            expect(groupsOps.saveGroup).toHaveBeenCalledWith(
                groupId,
                'Grupo test',
                senderId,
                [senderId, 'my-id', 'unknown-member'],
                'active',
                undefined,
                expect.objectContaining({ epoch: 1 }),
                { [senderId]: 'a'.repeat(64), 'my-id': 'b'.repeat(64), 'unknown-member': 'c'.repeat(64) },
            );
        });

        it('should send DR_RESET when group invite ratchet decrypt fails', async () => {
            vi.mocked(groupControlShared.decryptGroupControlPayload).mockImplementation(async (upeerId, packet, onReset) => {
                await onReset?.({ type: 'DR_RESET', ratchetContext: `group:${packet.groupId}` });
                return null;
            });
            const ratchet = await import('../../../src/main_process/security/ratchet.js');
            const ratchetOps = await import('../../../src/main_process/storage/ratchet/operations.js');
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'b'.repeat(64), name: 'Alice' } as never);
            vi.mocked(ratchetOps.getRatchetSession).mockReturnValue(null);
            vi.mocked(ratchet.ratchetDecrypt).mockReturnValue(null);

            const sendResponse = vi.fn();
            await handleGroupInvite(senderId, {
                groupId,
                payload: 'aa',
                nonce: 'bb',
                ratchetHeader: { dh: 'a'.repeat(64), pn: 0, n: 0 }
            } as GroupInviteData, mockWin, '1.2.3.4', sendResponse);

            expect(sendResponse).toHaveBeenCalledWith('1.2.3.4', expect.objectContaining({ type: 'DR_RESET' }));
            expect(groupsOps.saveGroup).not.toHaveBeenCalled();
        });
    });

    describe('handleGroupUpdate', () => {
        it('should reject legacy encrypted group updates', async () => {
            vi.mocked(groupControlShared.decryptGroupControlPayload).mockResolvedValue(null);
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({ groupId, adminUpeerId: senderId, epoch: 1, senderKey: 'd'.repeat(64) }));
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'b'.repeat(64) } as never);

            await handleGroupUpdate(senderId, {
                groupId,
                payload: 'aa',
                nonce: 'bb',
                ephemeralPublicKey: 'a'.repeat(64)
            } as GroupUpdateData, mockWin);
            expect(groupControlShared.updateGroupEphemeralKeyIfValid).toHaveBeenCalledWith(senderId, 'a'.repeat(64));
            expect(identity.decrypt).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupInfo).not.toHaveBeenCalled();
        });

        it('should ignore stale DR group update epochs', async () => {
            const inner = JSON.stringify({ epoch: 1, senderKey: 'd'.repeat(64), members: [senderId, 'my-id'] });
            vi.mocked(groupControlShared.decryptGroupControlPayload).mockResolvedValue(JSON.parse(inner));
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({ groupId, adminUpeerId: senderId, members: [senderId, 'my-id'], epoch: 2, senderKey: 'd'.repeat(64) }));
            const ratchet = await import('../../../src/main_process/security/ratchet.js');
            const ratchetOps = await import('../../../src/main_process/storage/ratchet/operations.js');
            vi.mocked(ratchetOps.getRatchetSession).mockReturnValue({ state: {} as never, spkIdUsed: 3 } as never);
            vi.mocked(ratchet.ratchetDecrypt).mockReturnValue(Buffer.from(inner));

            await handleGroupUpdate(senderId, {
                groupId,
                payload: 'aa',
                nonce: 'bb',
                ratchetHeader: { dh: 'c'.repeat(64), pn: 0, n: 1 },
            } as GroupUpdateData, mockWin);

            expect(groupsOps.updateGroupMembers).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupCrypto).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupInfo).not.toHaveBeenCalled();
        });

        it('should reject static-recipient legacy group updates', async () => {
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({ groupId, adminUpeerId: senderId, epoch: 1, senderKey: 'd'.repeat(64), members: [senderId, 'my-id'] }));

            await handleGroupUpdate(senderId, {
                groupId,
                payload: 'aa',
                nonce: 'bb',
                ephemeralPublicKey: 'a'.repeat(64),
                useRecipientEphemeral: false,
            } as GroupUpdateData, mockWin);

            expect(identity.decrypt).not.toHaveBeenCalled();
            expect(identity.decryptWithIdentityKey).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupInfo).not.toHaveBeenCalled();
        });

        it('should decrypt Double Ratchet group updates when a session already exists', async () => {
            const inner = JSON.stringify({ groupName: 'DR Name' });
            vi.mocked(groupControlShared.decryptGroupControlPayload).mockResolvedValue(JSON.parse(inner));
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({ groupId, adminUpeerId: senderId, epoch: 1, senderKey: 'd'.repeat(64), members: [senderId, 'my-id'] }));
            const ratchet = await import('../../../src/main_process/security/ratchet.js');
            const ratchetOps = await import('../../../src/main_process/storage/ratchet/operations.js');
            vi.mocked(ratchetOps.getRatchetSession).mockReturnValue({ state: {} as never, spkIdUsed: 3 } as never);
            vi.mocked(ratchet.ratchetDecrypt).mockReturnValue(Buffer.from(inner));

            await handleGroupUpdate(senderId, {
                groupId,
                payload: 'a'.repeat(32),
                nonce: 'b'.repeat(48),
                ratchetHeader: { dh: 'c'.repeat(64), pn: 0, n: 2 },
            } as GroupUpdateData, mockWin);

            expect(groupControlShared.decryptGroupControlPayload).toHaveBeenCalledWith(senderId, expect.objectContaining({ groupId }), expect.any(Function));
            expect(groupsOps.updateGroupInfo).toHaveBeenCalledWith(groupId, { name: 'DR Name' });
        });

        it('should keep local history and mark removed when a valid revocation removes me', async () => {
            const ratchet = await import('../../../src/main_process/security/ratchet.js');
            const ratchetOps = await import('../../../src/main_process/storage/ratchet/operations.js');
            const inner = JSON.stringify({
                members: [senderId, 'other-member'],
                epoch: 2,
            });
            vi.mocked(groupControlShared.decryptGroupControlPayload).mockResolvedValue(JSON.parse(inner));

            vi.mocked(identity.getMyUPeerId).mockReturnValue('my-id');
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({
                groupId,
                adminUpeerId: senderId,
                epoch: 1,
                senderKey: 'd'.repeat(64),
                members: [senderId, 'my-id', 'other-member']
            }));
            vi.mocked(ratchetOps.getRatchetSession).mockReturnValue({ state: {} as never, spkIdUsed: 3 } as never);
            vi.mocked(ratchet.ratchetDecrypt).mockReturnValue(Buffer.from(inner));

            await handleGroupUpdate(senderId, {
                groupId,
                payload: 'a'.repeat(32),
                nonce: 'b'.repeat(48),
                ratchetHeader: { dh: 'c'.repeat(64), pn: 0, n: 3 },
            } as GroupUpdateData, mockWin);

            expect(messagesOps.deleteMessagesByChatId).not.toHaveBeenCalled();
            expect(groupsOps.deleteGroup).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupMembers).toHaveBeenCalledWith(groupId, [senderId, 'other-member']);
            expect(groupsOps.updateGroupStatus).toHaveBeenCalledWith(groupId, 'removed');
            expect(groupsOps.updateGroupCrypto).toHaveBeenCalledWith(groupId, { epoch: 2 });
            expect(mockWin.webContents.send).toHaveBeenCalledWith('group-updated', {
                groupId,
                members: [senderId, 'other-member'],
                status: 'removed',
            });
        });

        it('rejects a revocation without a newer epoch', async () => {
            vi.mocked(groupControlShared.decryptGroupControlPayload).mockResolvedValue({
                members: [senderId, 'other-member'],
                epoch: 1,
            });
            vi.mocked(identity.getMyUPeerId).mockReturnValue('my-id');
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({
                groupId,
                adminUpeerId: senderId,
                epoch: 2,
                senderKey: 'd'.repeat(64),
                members: [senderId, 'my-id', 'other-member'],
            }));

            await handleGroupUpdate(senderId, {
                groupId,
                payload: 'a'.repeat(32),
                nonce: 'b'.repeat(48),
                ratchetHeader: { dh: 'c'.repeat(64), pn: 0, n: 4 },
            } as GroupUpdateData, mockWin);

            expect(groupsOps.updateGroupStatus).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupMembers).not.toHaveBeenCalled();
        });
    });

    describe('handleGroupAck', () => {
        it('should update status', async () => {
            const uuid = '550e8400-e29b-41d4-a716-446655440000';
            vi.mocked(messagesOps.getMessageById).mockResolvedValue({ id: uuid, chatUpeerId: groupId, isMine: 1 } as never);
            await handleGroupAck(senderId, { id: uuid, groupId } as GroupAckData, mockWin);
            expect(messagesOps.updateMessageStatus).toHaveBeenCalled();
        });

        it('should ignore ack for message not owned by me or from another group', async () => {
            const uuid = '550e8400-e29b-41d4-a716-446655440000';
            vi.mocked(messagesOps.getMessageById).mockResolvedValue({ id: uuid, chatUpeerId: 'other-group', isMine: 0 } as never);

            await handleGroupAck(senderId, { id: uuid, groupId } as GroupAckData, mockWin);

            expect(messagesOps.updateMessageStatus).not.toHaveBeenCalled();
            expect(mockWin.webContents.send).not.toHaveBeenCalledWith('group-message-delivered', expect.anything());
        });
    });

    describe('handleGroupLeave', () => {
        it('marks the local copy removed when its administrator leaves and preserves history', async () => {
            const groupControl = await import('../../../src/main_process/network/messaging/groupControl.js');
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({ groupId, adminUpeerId: senderId, members: [senderId, 'my-id', 'other'], epoch: 1, senderKey: 'd'.repeat(64) }));
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'pub', name: 'Leaver' } as never);
            vi.mocked(identity.verify).mockReturnValue(true);

            await handleGroupLeave(senderId, { groupId, signature: 'aa' } as GroupLeaveData, mockWin);
            expect(groupsOps.updateGroupMembers).toHaveBeenCalledWith(groupId, ['my-id', 'other']);
            expect(groupsOps.updateGroupStatus).toHaveBeenCalledWith(groupId, 'removed');
            expect(messagesOps.deleteMessagesByChatId).not.toHaveBeenCalled();
            expect(groupsOps.deleteGroup).not.toHaveBeenCalled();
            expect(groupControl.rotateGroupAfterMemberRemoval).not.toHaveBeenCalled();
        });

        it('marks the local group removed when its administrator leaves and no other members remain', async () => {
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({
                groupId,
                adminUpeerId: senderId,
                members: [senderId],
                epoch: 1,
                senderKey: 'd'.repeat(64),
            }));
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'pub', name: 'Leaver' } as never);
            vi.mocked(identity.verify).mockReturnValue(true);

            await handleGroupLeave(senderId, { groupId, signature: 'aa' } as GroupLeaveData, mockWin);

            expect(groupsOps.updateGroupMembers).toHaveBeenCalledWith(groupId, []);
            expect(groupsOps.updateGroupStatus).toHaveBeenCalledWith(groupId, 'removed');
        });

        it('rejects GROUP_LEAVE packets without a valid signature', async () => {
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({ groupId, adminUpeerId: 'my-id', members: [senderId, 'my-id'] }));
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'pub', name: 'Leaver' } as never);
            vi.mocked(identity.verify).mockReturnValue(false);

            await handleGroupLeave(senderId, { groupId } as GroupLeaveData, mockWin);

            expect(groupsOps.updateGroupMembers).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupStatus).not.toHaveBeenCalled();
            expect(messagesOps.saveMessage).not.toHaveBeenCalled();
        });

        it('should delete local group state for internal self leave sync', async () => {
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(undefined);
            vi.mocked(identity.verify).mockReturnValue(true);
            vi.mocked(groupsOps.getGroupById).mockReturnValue(makeGroup({ groupId, members: ['my-id', 'other'], epoch: 1, senderKey: 'd'.repeat(64) }));

            await handleGroupLeave('my-id', { groupId, signature: 'aa', isInternalSync: true } as GroupLeaveData, mockWin);

            expect(messagesOps.deleteMessagesByChatId).toHaveBeenCalledWith(groupId);
            expect(groupsOps.deleteGroup).toHaveBeenCalledWith(groupId);
            expect(mockWin.webContents.send).toHaveBeenCalledWith('group-updated', { groupId, members: [] });
        });
    });
});
