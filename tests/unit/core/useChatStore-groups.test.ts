import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/utils/notificationSound.js', () => ({
    playNotificationSound: vi.fn(),
}));

describe('useChatStore groups integration', () => {
    beforeEach(async () => {
        vi.resetModules();
        (window as any).upeer = {
            sendGroupMessage: vi.fn().mockResolvedValue({ id: 'msg-1', timestamp: 1710000000000 }),
            leaveGroup: vi.fn().mockResolvedValue({ success: true }),
            clearChat: vi.fn().mockResolvedValue({ success: true }),
            getGroups: vi.fn().mockResolvedValue([]),
        };
    });

    it('passes replyTo when sending a group message', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');

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

        await useChatStore.getState().handleSendGroupMessage('hola');

        expect(window.upeer.sendGroupMessage).toHaveBeenCalledWith('grp-1', 'hola', 'parent-1');
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
});
