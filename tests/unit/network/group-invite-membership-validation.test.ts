import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGroupInvite } from '../../../src/main_process/network/handlers/groups.js';
import * as groupsOps from '../../../src/main_process/storage/groups/operations.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations.js';
import * as vouches from '../../../src/main_process/security/reputation/vouches.js';
import * as groupControlShared from '../../../src/main_process/network/handlers/groupControlShared.js';

type InviteWindow = NonNullable<Parameters<typeof handleGroupInvite>[2]>;
type InviteData = Parameters<typeof handleGroupInvite>[1];

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    getGroupById: vi.fn(),
    saveGroup: vi.fn(),
    updateGroupCrypto: vi.fn(),
    updateGroupInfo: vi.fn(),
    updateGroupMembers: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMySignedPreKeyBundle: vi.fn(() => ({ spkPub: 'ab'.repeat(32), spkSig: 'cd'.repeat(64), spkId: 7 })),
    getMyUPeerId: vi.fn(() => 'my-id'),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    issueVouch: vi.fn().mockResolvedValue(true),
    VouchType: { MALICIOUS: 'MALICIOUS' },
}));

vi.mock('../../../src/main_process/network/handlers/groupControlShared.js', async () => {
    const actual = await vi.importActual('../../../src/main_process/network/handlers/groupControlShared.js');
    return {
        ...actual,
        decryptGroupControlPayload: vi.fn(),
        updateGroupEphemeralKeyIfValid: vi.fn(),
    };
});

vi.mock('../../../src/main_process/core/windowManager.js', () => ({
    getMainWindow: vi.fn(() => null),
}));

vi.mock('../../../src/main_process/utils/desktopNotification.js', () => ({
    showDesktopNotification: vi.fn(),
}));

vi.mock('../../../src/main_process/utils/windowFocus.js', () => ({
    focusWindow: vi.fn(),
}));

describe('group invite membership validation', () => {
    const mockWin = { webContents: { send: vi.fn() } } as unknown as InviteWindow;
    const senderId = 'sender-id';
    const groupId = 'group-id';

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ publicKey: 'b'.repeat(64), name: 'Alice' } as never);
        vi.mocked(groupControlShared.decryptGroupControlPayload).mockResolvedValue({
            groupName: 'Grupo trampa',
            members: [senderId, 'other-device'],
            epoch: 1,
            senderKey: 'c'.repeat(64),
        } as never);
        vi.mocked(groupsOps.getGroupById).mockReturnValue(null);
    });

    it('rejects invites that do not include the local user', async () => {
        await handleGroupInvite(senderId, {
            groupId,
            payload: 'aa',
            nonce: 'bb',
        } as InviteData, mockWin);

        expect(groupsOps.saveGroup).not.toHaveBeenCalled();
        expect(vouches.issueVouch).toHaveBeenCalledWith(senderId, 'MALICIOUS');
        expect(mockWin.webContents.send).not.toHaveBeenCalledWith('group-invite-received', expect.anything());
    });

    it('accepts invites that include the local user', async () => {
        vi.mocked(groupControlShared.decryptGroupControlPayload).mockResolvedValue({
            groupName: 'Grupo válido',
            members: [senderId, 'my-id'],
            epoch: 1,
            senderKey: 'c'.repeat(64),
        } as never);

        await handleGroupInvite(senderId, {
            groupId,
            payload: 'aa',
            nonce: 'bb',
        } as InviteData, mockWin);

        expect(groupsOps.saveGroup).toHaveBeenCalledWith(
            groupId,
            'Grupo válido',
            senderId,
            [senderId, 'my-id'],
            'active',
            undefined,
            expect.objectContaining({ epoch: 1, senderKey: 'c'.repeat(64) })
        );
        expect(vouches.issueVouch).not.toHaveBeenCalled();
        expect(mockWin.webContents.send).toHaveBeenCalledWith('group-invite-received', expect.objectContaining({
            groupId,
            groupName: 'Grupo válido',
        }));
    });
});
