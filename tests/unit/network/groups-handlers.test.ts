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
    getGroupById: vi.fn(),
    saveGroup: vi.fn(),
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
    saveMessage: vi.fn(),
    updateMessageStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    decrypt: vi.fn(),
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

describe('Group Handlers Final Coverage', () => {
    const mockWin = { webContents: { send: vi.fn() } } as any;
    const groupId = 'group-uuid-123';
    const senderId = 'sender-upeer-id';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleGroupMessage', () => {
        it('should process valid group message', async () => {
            const group = { id: groupId, members: [senderId, 'my-id'], adminUpeerId: 'admin' };
            const data = { id: '550e8400-e29b-41d4-a716-446655440000', groupId, content: 'hi', timestamp: 1710000000000 };
            (groupsOps.getGroupById as any).mockReturnValue(group);
            (messagesOps.saveMessage as any).mockResolvedValue({ changes: 1 });

            await handleGroupMessage(senderId, { upeerId: senderId } as any, data, mockWin);

            expect(messagesOps.saveMessage).toHaveBeenCalledWith(
                data.id,
                groupId,
                false,
                'hi',
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

        it('should decrypt using packet ephemeral key', async () => {
            const group = { id: groupId, members: [senderId, 'my-id'], adminUpeerId: 'admin' };
            const data = {
                id: '550e8400-e29b-41d4-a716-446655440000',
                groupId,
                content: 'aa',
                nonce: 'bb',
                ephemeralPublicKey: 'a'.repeat(64),
                useRecipientEphemeral: true,
                timestamp: 1710000000000
            };
            (groupsOps.getGroupById as any).mockReturnValue(group);
            (messagesOps.saveMessage as any).mockResolvedValue({ changes: 1 });
            (identity.decrypt as any).mockReturnValue(Buffer.from('hola grupo'));

            await handleGroupMessage(senderId, { upeerId: senderId, publicKey: 'b'.repeat(64) } as any, data, mockWin);

            expect(contactKeysOps.updateContactEphemeralPublicKey).toHaveBeenCalledWith(senderId, data.ephemeralPublicKey);
            expect(identity.decrypt).toHaveBeenCalledWith(
                Buffer.from(data.nonce, 'hex'),
                Buffer.from(data.content, 'hex'),
                Buffer.from(data.ephemeralPublicKey, 'hex')
            );
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
            const group = { id: groupId, members: [senderId] };
            (groupsOps.getGroupById as any).mockReturnValue(group);
            await handleGroupMessage(senderId, { upeerId: senderId } as any, { groupId }, mockWin);
            expect(messagesOps.saveMessage).not.toHaveBeenCalled();
        });
    });

    describe('handleGroupInvite', () => {
        it('should decrypt, save and surface a new group invite', async () => {
            const innerPayload = JSON.stringify({ groupName: 'Test Group', members: [senderId, 'my-id'], avatar: 'data:image/png;base64,abc' });
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
            expect(groupsOps.saveGroup).toHaveBeenCalledWith(groupId, 'Test Group', senderId, [senderId, 'my-id'], 'active', 'data:image/png;base64,abc');
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

            await handleGroupInvite(senderId, { groupId, payload: 'hex', nonce: 'hex' }, mockWin);
            expect(groupsOps.saveGroup).not.toHaveBeenCalled();
        });

        it('should reject invite updates for existing groups from non-admin members', async () => {
            const innerPayload = JSON.stringify({ groupName: 'Test Group', members: [senderId, 'my-id'] });
            (identity.decrypt as any).mockReturnValue(Buffer.from(innerPayload));
            (groupsOps.getGroupById as any).mockReturnValue({
                groupId,
                members: [senderId, 'my-id'],
                adminUpeerId: 'actual-admin'
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
    });

    describe('handleGroupUpdate', () => {
        it('should update group info', async () => {
            const inner = JSON.stringify({ groupName: 'New Name' });
            (groupsOps.getGroupById as any).mockReturnValue({ id: groupId, adminUpeerId: senderId });
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
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'pub', name: 'Leaver' });
            (identity.verify as any).mockReturnValue(true);
            (groupsOps.getGroupById as any).mockReturnValue({ id: groupId, members: [senderId, 'other'] });

            await handleGroupLeave(senderId, { groupId, signature: 'sig' }, mockWin);
            expect(groupsOps.updateGroupMembers).toHaveBeenCalled();
        });
    });
});
