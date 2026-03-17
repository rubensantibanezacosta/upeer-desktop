import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGroupMessage, handleGroupInvite, handleGroupUpdate } from '../../../src/main_process/network/handlers/groups.js';
import * as db from '../../../src/main_process/storage/db.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as reputation from '../../../src/main_process/security/reputation/vouches.js';

// Mock de DB
vi.mock('../../../src/main_process/storage/db.js', () => ({
    getGroupById: vi.fn(),
    saveGroup: vi.fn(),
    updateGroupInfo: vi.fn(),
    updateGroupMembers: vi.fn(),
    saveMessage: vi.fn(),
    updateMessageStatus: vi.fn(),
    getContactByUpeerId: vi.fn(),
}));

// Mock de Identidad y Crypto
vi.mock('../../../src/main_process/security/identity.js', () => ({
    decrypt: vi.fn(),
    verify: vi.fn(() => true),
}));

// Mock de Reputación
vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    issueVouch: vi.fn(async () => { }),
    VouchType: { MALICIOUS: 'MALICIOUS' }
}));

// Mock de Electron
const mockWin = {
    webContents: {
        send: vi.fn()
    }
} as any;

describe('Group Handlers', () => {
    const senderId = 'sender-upeer-id';
    const groupId = 'group-uuid-123';
    const mockContact = { upeerId: senderId, name: 'Sender', publicKey: 'sender-pub' };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('handleGroupMessage', () => {
        it('should reject message if group does not exist (anti-ghost group fix)', async () => {
            const data = { groupId, content: 'hola' };
            (db.getGroupById as any).mockReturnValue(null);

            await handleGroupMessage(senderId, mockContact, data, mockWin);

            expect(db.saveMessage).not.toHaveBeenCalled();
            expect(reputation.issueVouch).not.toHaveBeenCalled();
        });

        it('should reject and vouch MALICIOUS if sender is not a member', async () => {
            const data = { groupId, content: 'hola' };
            (db.getGroupById as any).mockReturnValue({ id: groupId, members: ['other-id'] });

            await handleGroupMessage(senderId, mockContact, data, mockWin);

            expect(db.saveMessage).not.toHaveBeenCalled();
            expect(reputation.issueVouch).toHaveBeenCalledWith(senderId, 'MALICIOUS');
        });

        it('should process valid group message and notify UI', async () => {
            const data = {
                id: '550e8400-e29b-41d4-a716-446655440000',
                groupId,
                content: 'mensaje de grupo'
            };
            (db.getGroupById as any).mockReturnValue({ id: groupId, members: [senderId, 'my-id'] });
            (db.saveMessage as any).mockResolvedValue({ changes: 1 });

            await handleGroupMessage(senderId, mockContact, data, mockWin);

            expect(db.saveMessage).toHaveBeenCalledWith(
                data.id,
                groupId,
                false,
                'mensaje de grupo',
                undefined,
                undefined,
                'delivered',
                senderId
            );
            expect(mockWin.webContents.send).toHaveBeenCalledWith('receive-group-message', expect.objectContaining({
                message: 'mensaje de grupo',
                groupId
            }));
        });

        it('should decrypt E2E content if nonce is provided', async () => {
            const data = {
                groupId,
                content: 'hex-cipher',
                nonce: 'hex-nonce',
                useRecipientEphemeral: false
            };
            (db.getGroupById as any).mockReturnValue({ id: groupId, members: [senderId] });
            (identity.decrypt as any).mockReturnValue(Buffer.from('mensaje secreto'));
            (db.saveMessage as any).mockResolvedValue({ changes: 1 });

            await handleGroupMessage(senderId, mockContact, data, mockWin);

            expect(identity.decrypt).toHaveBeenCalled();
            expect(db.saveMessage).toHaveBeenCalledWith(
                expect.any(String),
                groupId,
                false,
                'mensaje secreto',
                undefined,
                undefined,
                'delivered',
                senderId
            );
        });
    });

    describe('handleGroupInvite', () => {
        it('should decrypt invite and save new group', async () => {
            const innerPayload = JSON.stringify({
                groupName: 'Secret Society',
                members: [senderId, 'my-id'],
                avatar: 'data:image/png;base64,valid'
            });
            const data = {
                groupId,
                payload: 'hex-payload',
                nonce: 'hex-nonce',
                adminUpeerId: senderId
            };

            (db.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'admin-pub' });
            (identity.decrypt as any).mockReturnValue(Buffer.from(innerPayload));
            (db.getGroupById as any).mockReturnValue(null);

            await handleGroupInvite(senderId, data, mockWin);

            expect(db.saveGroup).toHaveBeenCalledWith(
                groupId,
                'Secret Society',
                senderId,
                [senderId, 'my-id'],
                'active',
                'data:image/png;base64,valid'
            );
            expect(mockWin.webContents.send).toHaveBeenCalledWith('group-invite-received', expect.objectContaining({
                groupName: 'Secret Society'
            }));
        });

        it('should reject if groupName is too long (DoS protection)', async () => {
            const innerPayload = JSON.stringify({
                groupName: 'A'.repeat(101),
                members: [senderId]
            });
            const data = { groupId, payload: 'hex', nonce: 'hex' };

            (db.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'pub' });
            (identity.decrypt as any).mockReturnValue(Buffer.from(innerPayload));

            await handleGroupInvite(senderId, data, mockWin);

            expect(db.saveGroup).not.toHaveBeenCalled();
        });

        it('should reject if members list is too large (DoS protection)', async () => {
            const innerPayload = JSON.stringify({
                groupName: 'Big Group',
                members: Array(501).fill('peer-id')
            });
            const data = { groupId, payload: 'hex', nonce: 'hex' };

            (db.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'pub' });
            (identity.decrypt as any).mockReturnValue(Buffer.from(innerPayload));

            await handleGroupInvite(senderId, data, mockWin);

            expect(db.saveGroup).not.toHaveBeenCalled();
        });
    });

    describe('handleGroupUpdate', () => {
        it('should update group info if sender is admin', async () => {
            const innerPayload = JSON.stringify({ groupName: 'New Name' });
            const data = { groupId, payload: 'hex', nonce: 'hex', adminUpeerId: senderId };

            (db.getGroupById as any).mockReturnValue({ id: groupId, adminUpeerId: senderId });
            (db.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'admin-pub' });
            (identity.decrypt as any).mockReturnValue(Buffer.from(innerPayload));

            await handleGroupUpdate(senderId, data, mockWin);

            expect(db.updateGroupInfo).toHaveBeenCalledWith(groupId, { name: 'New Name' });
            expect(mockWin.webContents.send).toHaveBeenCalledWith('group-updated', {
                groupId,
                name: 'New Name'
            });
        });

        it('should reject update if sender is NOT admin', async () => {
            const data = { groupId, adminUpeerId: 'not-admin' };
            (db.getGroupById as any).mockReturnValue({ id: groupId, adminUpeerId: 'real-admin' });

            await handleGroupUpdate('hacker-id', data, mockWin);

            expect(db.updateGroupInfo).not.toHaveBeenCalled();
        });
    });
});
