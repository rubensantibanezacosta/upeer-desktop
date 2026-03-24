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
import * as contactKeysOps from '../../../src/main_process/storage/contacts/keys.js';
import * as messagesOps from '../../../src/main_process/storage/messages/operations.js';
import * as identity from '../../../src/main_process/security/identity.js';

// Mocks
vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    deleteGroup: vi.fn(),
    getGroupById: vi.fn(),
    saveGroup: vi.fn(),
    updateGroupCrypto: vi.fn(),
    updateGroupInfo: vi.fn(),
    updateGroupMembers: vi.fn(),
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
    verify: vi.fn(),
    getMyUPeerId: vi.fn().mockReturnValue('my-id'),
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

describe('Group Handlers Final Coverage', () => {
    const mockWin = { webContents: { send: vi.fn() } } as any;
    const groupId = 'group-uuid-123';
    const senderId = 'sender-upeer-id';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleGroupMessage', () => {
        it('should process valid group message', async () => {
            const group = { id: groupId, members: [senderId, 'my-id'], adminUpeerId: 'admin', epoch: 1, senderKey: 'c'.repeat(64) };
            const data = { id: '550e8400-e29b-41d4-a716-446655440000', groupId, content: 'hi', nonce: '11'.repeat(24), epoch: 1, timestamp: 1710000000000 };
            (groupsOps.getGroupById as any).mockReturnValue(group);
            (messagesOps.saveMessage as any).mockResolvedValue({ changes: 1 });

            await handleGroupMessage(senderId, { upeerId: senderId } as any, data, mockWin);

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
            const group = { id: groupId, members: [senderId, 'my-id'], adminUpeerId: 'admin', epoch: 4, senderKey: 'c'.repeat(64) };
            const data = {
                id: '550e8400-e29b-41d4-a716-446655440000',
                groupId,
                content: 'aa',
                nonce: '11'.repeat(24),
                epoch: 4,
                timestamp: 1710000000000
            };
            (groupsOps.getGroupById as any).mockReturnValue(group);
            (messagesOps.saveMessage as any).mockResolvedValue({ changes: 1 });

            await handleGroupMessage(senderId, { upeerId: senderId, publicKey: 'b'.repeat(64) } as any, data, mockWin);

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
            const group = { id: groupId, members: [senderId], epoch: 1, senderKey: 'c'.repeat(64) };
            (groupsOps.getGroupById as any).mockReturnValue(group);
            await handleGroupMessage(senderId, { upeerId: senderId } as any, { groupId }, mockWin);
            expect(messagesOps.saveMessage).not.toHaveBeenCalled();
        });

        it('should save self-synced group messages as mine', async () => {
            const myId = 'my-id';
            const group = { id: groupId, groupId, members: [senderId, myId], adminUpeerId: 'admin', epoch: 1, senderKey: 'c'.repeat(64) };
            const data = { id: '550e8400-e29b-41d4-a716-446655440001', groupId, content: 'hi', nonce: '11'.repeat(24), epoch: 1, timestamp: 1710000000001, isInternalSync: true };
            (identity.getMyUPeerId as any).mockReturnValue(myId);
            (groupsOps.getGroupById as any).mockReturnValue(group);
            (messagesOps.getMessageById as any).mockResolvedValue(null);
            (messagesOps.saveMessage as any).mockResolvedValue({ changes: 1 });

            await handleGroupMessage(myId, { upeerId: myId, name: 'Yo' } as any, data, mockWin);

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
    });

    describe('handleGroupInvite', () => {
        it('should decrypt, save and surface a new group invite', async () => {
            const innerPayload = JSON.stringify({ groupName: 'Test Group', members: [senderId, 'my-id'], epoch: 1, senderKey: 'c'.repeat(64), avatar: 'data:image/png;base64,abc' });
            (identity.decrypt as any).mockReturnValue(Buffer.from(innerPayload));
            (groupsOps.getGroupById as any).mockReturnValue(null);
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'b'.repeat(64), name: 'Alice' });
            (messagesOps.saveMessage as any).mockResolvedValue({ changes: 1 });

            await handleGroupInvite(senderId, {
                groupId,
                payload: 'aa',
                nonce: 'bb',
                ephemeralPublicKey: 'a'.repeat(64)
            }, mockWin);

            expect(contactKeysOps.updateContactEphemeralPublicKey).toHaveBeenCalledWith(senderId, 'a'.repeat(64));
            expect(identity.decrypt).toHaveBeenCalledWith(
                Buffer.from('bb', 'hex'),
                Buffer.from('aa', 'hex'),
                Buffer.from('a'.repeat(64), 'hex')
            );
            expect(groupsOps.saveGroup).toHaveBeenCalledWith(
                groupId,
                'Test Group',
                senderId,
                [senderId, 'my-id'],
                'active',
                'data:image/png;base64,abc',
                expect.objectContaining({ epoch: 1, senderKey: 'c'.repeat(64) })
            );
            expect(messagesOps.saveMessage).toHaveBeenCalledWith(
                expect.any(String),
                groupId,
                false,
                '__SYS__|Alice te añadió al grupo',
                undefined,
                undefined,
                'delivered',
                senderId,
                expect.any(Number)
            );
            expect(mockWin.webContents.send).toHaveBeenCalledWith('receive-group-message', expect.objectContaining({
                groupId,
                isSystem: true,
                senderName: 'Alice'
            }));
            expect(mockWin.webContents.send).toHaveBeenCalledWith('group-invite-received', expect.objectContaining({
                groupId,
                groupName: 'Test Group',
                avatar: 'data:image/png;base64,abc'
            }));
        });

        it('should fail if decryption fails', async () => {
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'pub' });
            (identity.decrypt as any).mockReturnValue(null);
            (identity.decryptWithIdentityKey as any).mockReturnValue(null);

            await handleGroupInvite(senderId, { groupId, payload: 'hex', nonce: 'hex' }, mockWin);
            expect(groupsOps.saveGroup).not.toHaveBeenCalled();
        });

        it('should fallback to identity-key decryption for static-key group invites', async () => {
            const innerPayload = JSON.stringify({ groupName: 'Static Group', members: [senderId, 'my-id'], epoch: 1, senderKey: 'c'.repeat(64) });
            (identity.decrypt as any).mockReturnValue(null);
            (identity.decryptWithIdentityKey as any).mockReturnValue(Buffer.from(innerPayload));
            (groupsOps.getGroupById as any).mockReturnValue(null);
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'b'.repeat(64), name: 'Alice' });
            (messagesOps.saveMessage as any).mockResolvedValue({ changes: 1 });

            await handleGroupInvite(senderId, {
                groupId,
                payload: 'aa',
                nonce: 'bb',
                ephemeralPublicKey: 'a'.repeat(64),
                useRecipientEphemeral: false,
            }, mockWin);

            expect(identity.decryptWithIdentityKey).toHaveBeenCalledWith(
                Buffer.from('bb', 'hex'),
                Buffer.from('aa', 'hex'),
                Buffer.from('a'.repeat(64), 'hex')
            );
            expect(groupsOps.saveGroup).toHaveBeenCalledWith(
                groupId,
                'Static Group',
                senderId,
                [senderId, 'my-id'],
                'active',
                undefined,
                expect.objectContaining({ epoch: 1, senderKey: 'c'.repeat(64) })
            );
        });

        it('should reject invite updates for existing groups from non-admin members', async () => {
            const innerPayload = JSON.stringify({ groupName: 'Test Group', members: [senderId, 'my-id'], epoch: 2, senderKey: 'c'.repeat(64) });
            (identity.decrypt as any).mockReturnValue(Buffer.from(innerPayload));
            (groupsOps.getGroupById as any).mockReturnValue({
                groupId,
                members: [senderId, 'my-id'],
                adminUpeerId: 'actual-admin',
                epoch: 1,
                senderKey: 'd'.repeat(64)
            });
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'b'.repeat(64), name: 'Mallory' });

            await handleGroupInvite(senderId, {
                groupId,
                adminUpeerId: senderId,
                payload: 'aa',
                nonce: 'bb'
            }, mockWin);

            expect(groupsOps.updateGroupMembers).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupInfo).not.toHaveBeenCalled();
        });

        it('should ignore duplicate invite with same epoch and sender key', async () => {
            const innerPayload = JSON.stringify({ groupName: 'Test Group', members: [senderId, 'my-id'], epoch: 2, senderKey: 'c'.repeat(64) });
            (identity.decrypt as any).mockReturnValue(Buffer.from(innerPayload));
            (groupsOps.getGroupById as any).mockReturnValue({
                groupId,
                name: 'Test Group',
                members: [senderId, 'my-id'],
                adminUpeerId: senderId,
                epoch: 2,
                senderKey: 'c'.repeat(64)
            });
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'b'.repeat(64), name: 'Alice' });

            await handleGroupInvite(senderId, {
                groupId,
                adminUpeerId: senderId,
                payload: 'aa',
                nonce: 'bb'
            }, mockWin);

            expect(groupsOps.updateGroupMembers).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupCrypto).not.toHaveBeenCalled();
            expect(mockWin.webContents.send).not.toHaveBeenCalledWith('group-invite-received', expect.anything());
        });
    });

    describe('handleGroupUpdate', () => {
        it('should update group info', async () => {
            const inner = JSON.stringify({ groupName: 'New Name' });
            (groupsOps.getGroupById as any).mockReturnValue({ id: groupId, adminUpeerId: senderId, epoch: 1, senderKey: 'd'.repeat(64) });
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'b'.repeat(64) });
            (identity.decrypt as any).mockReturnValue(Buffer.from(inner));

            await handleGroupUpdate(senderId, {
                groupId,
                payload: 'aa',
                nonce: 'bb',
                ephemeralPublicKey: 'a'.repeat(64)
            }, mockWin);
            expect(contactKeysOps.updateContactEphemeralPublicKey).toHaveBeenCalledWith(senderId, 'a'.repeat(64));
            expect(identity.decrypt).toHaveBeenCalledWith(
                Buffer.from('bb', 'hex'),
                Buffer.from('aa', 'hex'),
                Buffer.from('a'.repeat(64), 'hex')
            );
            expect(groupsOps.updateGroupInfo).toHaveBeenCalled();
        });

        it('should ignore stale group update epochs', async () => {
            const inner = JSON.stringify({ epoch: 1, senderKey: 'd'.repeat(64), members: [senderId, 'my-id'] });
            (groupsOps.getGroupById as any).mockReturnValue({ id: groupId, adminUpeerId: senderId, members: [senderId, 'my-id'], epoch: 2, senderKey: 'd'.repeat(64) });
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'b'.repeat(64) });
            (identity.decrypt as any).mockReturnValue(Buffer.from(inner));

            await handleGroupUpdate(senderId, {
                groupId,
                payload: 'aa',
                nonce: 'bb'
            }, mockWin);

            expect(groupsOps.updateGroupMembers).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupCrypto).not.toHaveBeenCalled();
            expect(groupsOps.updateGroupInfo).not.toHaveBeenCalled();
        });

        it('should fallback to identity-key decryption for static-key group updates', async () => {
            const inner = JSON.stringify({ groupName: 'Static Name' });
            (groupsOps.getGroupById as any).mockReturnValue({ id: groupId, groupId, adminUpeerId: senderId, epoch: 1, senderKey: 'd'.repeat(64), members: [senderId, 'my-id'] });
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'b'.repeat(64) });
            (identity.decrypt as any).mockReturnValue(null);
            (identity.decryptWithIdentityKey as any).mockReturnValue(Buffer.from(inner));

            await handleGroupUpdate(senderId, {
                groupId,
                payload: 'aa',
                nonce: 'bb',
                ephemeralPublicKey: 'a'.repeat(64),
                useRecipientEphemeral: false,
            }, mockWin);

            expect(identity.decryptWithIdentityKey).toHaveBeenCalledWith(
                Buffer.from('bb', 'hex'),
                Buffer.from('aa', 'hex'),
                Buffer.from('a'.repeat(64), 'hex')
            );
            expect(groupsOps.updateGroupInfo).toHaveBeenCalledWith(groupId, { name: 'Static Name' });
        });
    });

    describe('handleGroupAck', () => {
        it('should update status', async () => {
            const uuid = '550e8400-e29b-41d4-a716-446655440000';
            await handleGroupAck(senderId, { id: uuid, groupId }, mockWin);
            expect(messagesOps.updateMessageStatus).toHaveBeenCalled();
        });
    });

    describe('handleGroupLeave', () => {
        it('should verify signature and leave', async () => {
            const groupControl = await import('../../../src/main_process/network/messaging/groupControl.js');
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'pub', name: 'Leaver' });
            (identity.verify as any).mockReturnValue(true);
            (groupsOps.getGroupById as any).mockReturnValue({ id: groupId, members: [senderId, 'other'], epoch: 1, senderKey: 'd'.repeat(64) });

            await handleGroupLeave(senderId, { groupId, signature: 'sig' }, mockWin);
            expect(groupsOps.updateGroupMembers).toHaveBeenCalled();
            expect(groupControl.rotateGroupAfterMemberRemoval).toHaveBeenCalledWith(groupId, senderId);
        });

        it('should delete local group state for internal self leave sync', async () => {
            (contactsOps.getContactByUpeerId as any).mockResolvedValue(null);
            (identity.verify as any).mockReturnValue(true);
            (groupsOps.getGroupById as any).mockReturnValue({ id: groupId, members: ['my-id', 'other'], epoch: 1, senderKey: 'd'.repeat(64) });

            await handleGroupLeave('my-id', { groupId, signature: 'sig', isInternalSync: true }, mockWin);

            expect(messagesOps.deleteMessagesByChatId).toHaveBeenCalledWith(groupId);
            expect(groupsOps.deleteGroup).toHaveBeenCalledWith(groupId);
            expect(mockWin.webContents.send).toHaveBeenCalledWith('group-updated', { groupId, members: [] });
        });
    });
});
