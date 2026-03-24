import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/utils/notificationSound.js', () => ({
    playNotificationSound: vi.fn(),
}));

describe('useChatStore groups integration', () => {
    beforeEach(async () => {
        vi.resetModules();
        (window as any).upeer = {
            sendGroupMessage: vi.fn().mockResolvedValue({ id: 'msg-1', timestamp: 1710000000000 }),
            inviteToGroup: vi.fn().mockResolvedValue({ success: true }),
            leaveGroup: vi.fn().mockResolvedValue({ success: true }),
            clearChat: vi.fn().mockResolvedValue({ success: true }),
            getGroups: vi.fn().mockResolvedValue([]),
        };
    });

    it('passes replyTo when sending a group message', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');
        const preview = { url: 'https://example.com', title: 'Example' };
        (window as any).upeer.getGroups.mockResolvedValue([{ groupId: 'grp-1', members: [] }]);

        useChatStore.setState({
            activeGroupId: 'grp-1',
            myIdentity: { upeerId: 'me', publicKey: 'pk', address: null, alias: 'Yo' },
            groupChatHistory: [],
            messagesByConversation: { 'grp-1': 'hola' },
            replyByConversation: {
                'grp-1': {
                    id: 'parent-1',
                    upeerId: 'grp-1',
                    isMine: false,
                    message: 'mensaje padre',
                    status: 'delivered',
                    timestamp: '10:00',
                    date: 1710000000000,
                }
            }
        } as any);

        await useChatStore.getState().handleSendGroupMessage('hola', preview as any);

        expect(window.upeer.sendGroupMessage).toHaveBeenCalledWith('grp-1', 'hola', 'parent-1', preview);
        const state = useChatStore.getState();
        expect(state.groupChatHistory.at(-1)).toEqual(expect.objectContaining({
            id: 'msg-1',
            replyTo: 'parent-1',
            message: 'hola',
            groupId: 'grp-1'
        }));
        expect(state.replyByConversation['grp-1']).toBeNull();
    });

    it('clears active group state when leaving the open group', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');

        useChatStore.setState({
            activeGroupId: 'grp-1',
            groupChatHistory: [{
                id: 'msg-1',
                upeerId: 'grp-1',
                groupId: 'grp-1',
                isMine: true,
                message: 'hola',
                status: 'sent',
                timestamp: '10:00',
                date: 1710000000000,
            }],
            isWindowedHistory: true,
        } as any);

        await useChatStore.getState().handleLeaveGroup('grp-1');

        expect(window.upeer.leaveGroup).toHaveBeenCalledWith('grp-1');
        expect(useChatStore.getState()).toEqual(expect.objectContaining({
            activeGroupId: '',
            groupChatHistory: [],
            isWindowedHistory: false,
        }));
    });

    it('clears stale active group state after refresh when the group no longer exists', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');

        useChatStore.setState({
            activeGroupId: 'grp-1',
            groupChatHistory: [{
                id: 'msg-1',
                upeerId: 'grp-1',
                groupId: 'grp-1',
                isMine: true,
                message: 'hola',
                status: 'sent',
                timestamp: '10:00',
                date: 1710000000000,
            }],
            isWindowedHistory: true,
        } as any);

        await useChatStore.getState().refreshGroups();

        expect(useChatStore.getState()).toEqual(expect.objectContaining({
            activeGroupId: '',
            groupChatHistory: [],
            isWindowedHistory: false,
        }));
    });

    it('invites multiple members to an existing group', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');

        await useChatStore.getState().handleInviteGroupMembers('grp-1', ['peer-1', 'peer-2']);

        expect(window.upeer.inviteToGroup).toHaveBeenNthCalledWith(1, 'grp-1', 'peer-1');
        expect(window.upeer.inviteToGroup).toHaveBeenNthCalledWith(2, 'grp-1', 'peer-2');
        expect(window.upeer.getGroups).toHaveBeenCalled();
    });

    it('clears the active group chat when no explicit id is passed', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');

        useChatStore.setState({
            activeGroupId: 'grp-1',
            targetUpeerId: '',
            groupChatHistory: [{
                id: 'msg-1',
                upeerId: 'grp-1',
                groupId: 'grp-1',
                isMine: true,
                message: 'hola',
                status: 'sent',
                timestamp: '10:00',
                date: 1710000000000,
            }],
        } as any);

        useChatStore.getState().handleClearChat();
        await Promise.resolve();

        expect(window.upeer.clearChat).toHaveBeenCalledWith('grp-1');
        expect(useChatStore.getState().groupChatHistory).toEqual([]);
    });

    it('keeps link preview payload when editing a message with preview', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');
        const preview = { url: 'https://example.com', title: 'Example' };
        (window as any).upeer.sendChatUpdate = vi.fn().mockResolvedValue(undefined);

        useChatStore.setState({
            targetUpeerId: 'peer-1',
            activeGroupId: '',
            chatHistory: [{
                id: 'msg-1',
                upeerId: 'peer-1',
                isMine: true,
                message: JSON.stringify({ text: 'hola https://example.com', linkPreview: preview }),
                status: 'sent',
                timestamp: '10:00',
                date: 1710000000000,
            }],
            groupChatHistory: [],
        } as any);

        useChatStore.getState().handleUpdateMessage('msg-1', 'hola https://example.com', preview as any);

        expect(window.upeer.sendChatUpdate).toHaveBeenCalledWith('peer-1', 'msg-1', 'hola https://example.com', preview);
        expect(useChatStore.getState().chatHistory[0].message).toBe(JSON.stringify({ text: 'hola https://example.com', linkPreview: preview }));
    });
});
