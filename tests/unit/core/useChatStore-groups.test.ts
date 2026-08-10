import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, LinkPreview, MyIdentity } from '../../../src/types/chat.js';

type MockUpeer = {
    sendMessage: ReturnType<typeof vi.fn>;
    sendGroupMessage: ReturnType<typeof vi.fn>;
    inviteToGroup: ReturnType<typeof vi.fn>;
    leaveGroup: ReturnType<typeof vi.fn>;
    clearChat: ReturnType<typeof vi.fn>;
    getContacts: ReturnType<typeof vi.fn>;
    getGroups: ReturnType<typeof vi.fn>;
    sendReadReceipt: ReturnType<typeof vi.fn>;
    onReceive: ReturnType<typeof vi.fn>;
    onContactRequest: ReturnType<typeof vi.fn>;
    onHandshakeFinished: ReturnType<typeof vi.fn>;
    onContactUntrustworthy: ReturnType<typeof vi.fn>;
    onKeyChangeAlert: ReturnType<typeof vi.fn>;
    onTyping: ReturnType<typeof vi.fn>;
    onGroupMessage: ReturnType<typeof vi.fn>;
    onGroupInvite: ReturnType<typeof vi.fn>;
    onGroupUpdated: ReturnType<typeof vi.fn>;
    onMessageDelivered: ReturnType<typeof vi.fn>;
    onMessageRead: ReturnType<typeof vi.fn>;
    onMessageStatusUpdated: ReturnType<typeof vi.fn>;
    onGroupMessageDelivered: ReturnType<typeof vi.fn>;
    onMessageReactionUpdated: ReturnType<typeof vi.fn>;
    onMessageUpdated: ReturnType<typeof vi.fn>;
    onPresence: ReturnType<typeof vi.fn>;
    sendChatUpdate?: ReturnType<typeof vi.fn>;
};

function getUpeerMock(): MockUpeer {
    return (window as unknown as { upeer: MockUpeer }).upeer;
}

function setUpeerMock(mock: MockUpeer): void {
    (window as unknown as { upeer: MockUpeer }).upeer = mock;
}

const myIdentity: MyIdentity = { upeerId: 'me', publicKey: 'pk', address: null, alias: 'Yo' };

function createGroupMessage(message: string): ChatMessage {
    return {
        id: 'msg-1',
        upeerId: 'grp-1',
        groupId: 'grp-1',
        isMine: true,
        message,
        status: 'sent',
        timestamp: '10:00',
        date: 1710000000000,
    };
}

vi.mock('../../../src/utils/notificationSound.js', () => ({
    playNotificationSound: vi.fn(),
}));

describe('useChatStore groups integration', () => {
    beforeEach(async () => {
        vi.resetModules();
        delete (window as Window & { __chat_listeners_initialized?: boolean }).__chat_listeners_initialized;
        setUpeerMock({
            sendMessage: vi.fn().mockResolvedValue({ id: 'msg-direct', savedMessage: 'intermedio', timestamp: 200 }),
            sendGroupMessage: vi.fn().mockResolvedValue({ id: 'msg-1', timestamp: 1710000000000 }),
            inviteToGroup: vi.fn().mockResolvedValue({ success: true }),
            leaveGroup: vi.fn().mockResolvedValue({ success: true }),
            clearChat: vi.fn().mockResolvedValue({ success: true }),
            getContacts: vi.fn().mockResolvedValue([]),
            getGroups: vi.fn().mockResolvedValue([]),
            sendReadReceipt: vi.fn(),
            onReceive: vi.fn(),
            onContactRequest: vi.fn(),
            onHandshakeFinished: vi.fn(),
            onContactUntrustworthy: vi.fn(),
            onKeyChangeAlert: vi.fn(),
            onTyping: vi.fn(),
            onGroupMessage: vi.fn(),
            onGroupInvite: vi.fn(),
            onGroupUpdated: vi.fn(),
            onMessageDelivered: vi.fn(),
            onMessageRead: vi.fn(),
            onMessageStatusUpdated: vi.fn(),
            onGroupMessageDelivered: vi.fn(),
            onMessageReactionUpdated: vi.fn(),
            onMessageUpdated: vi.fn(),
            onPresence: vi.fn(),
        });
    });

    it('keeps recovered direct messages ordered by sent timestamp', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');

        useChatStore.setState({
            targetUpeerId: 'peer-1',
            activeGroupId: '',
            chatHistory: [
                {
                    id: 'msg-100',
                    upeerId: 'peer-1',
                    isMine: false,
                    message: 'primero',
                    status: 'read',
                    timestamp: '10:00',
                    date: 100,
                },
                {
                    id: 'msg-300',
                    upeerId: 'peer-1',
                    isMine: false,
                    message: 'tercero',
                    status: 'read',
                    timestamp: '10:03',
                    date: 300,
                }
            ],
        });

        useChatStore.getState().initListeners();
        const onReceive = getUpeerMock().onReceive.mock.calls[0]?.[0] as ((data: Record<string, unknown>) => void);

        onReceive({
            id: 'msg-200',
            upeerId: 'peer-1',
            isMine: false,
            message: 'segundo',
            status: 'delivered',
            timestamp: 200,
        });

        expect(useChatStore.getState().chatHistory.map((message) => message.id)).toEqual(['msg-100', 'msg-200', 'msg-300']);
    });

    it('passes replyTo when sending a group message', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');
        const preview: LinkPreview = { url: 'https://example.com', title: 'Example' };
        getUpeerMock().getGroups.mockResolvedValue([{ groupId: 'grp-1', members: [] }]);

        useChatStore.setState({
            activeGroupId: 'grp-1',
            myIdentity,
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
        });

        await useChatStore.getState().handleSendGroupMessage('hola', preview);

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

    it('keeps local direct sends ordered by sent timestamp', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');

        useChatStore.setState({
            targetUpeerId: 'peer-1',
            activeGroupId: '',
            myIdentity,
            chatHistory: [
                {
                    id: 'msg-100',
                    upeerId: 'peer-1',
                    isMine: false,
                    message: 'primero',
                    status: 'read',
                    timestamp: '10:00',
                    date: 100,
                },
                {
                    id: 'msg-300',
                    upeerId: 'peer-1',
                    isMine: false,
                    message: 'tercero',
                    status: 'read',
                    timestamp: '10:03',
                    date: 300,
                }
            ],
            messagesByConversation: { 'peer-1': 'intermedio' },
            replyByConversation: { 'peer-1': null },
        });

        await useChatStore.getState().handleSend();

        expect(window.upeer.sendMessage).toHaveBeenCalledWith('peer-1', 'intermedio', undefined, undefined);
        expect(useChatStore.getState().chatHistory.map((message) => message.id)).toEqual(['msg-100', 'msg-direct', 'msg-300']);
    });

    it('clears active group state when leaving the open group', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');

        useChatStore.setState({
            activeGroupId: 'grp-1',
            groupChatHistory: [createGroupMessage('hola')],
            isWindowedHistory: true,
        });

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
            groupChatHistory: [createGroupMessage('hola')],
            isWindowedHistory: true,
        });

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
            groupChatHistory: [createGroupMessage('hola')],
        });

        useChatStore.getState().handleClearChat();
        await Promise.resolve();

        expect(window.upeer.clearChat).toHaveBeenCalledWith('grp-1');
        expect(useChatStore.getState().groupChatHistory).toEqual([]);
    });

    it('keeps link preview payload when editing a message with preview', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');
        const preview: LinkPreview = { url: 'https://example.com', title: 'Example' };
        getUpeerMock().sendChatUpdate = vi.fn().mockResolvedValue(undefined);

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
        });

        useChatStore.getState().handleUpdateMessage('msg-1', 'hola https://example.com', preview);

        expect(window.upeer.sendChatUpdate).toHaveBeenCalledWith('peer-1', 'msg-1', 'hola https://example.com', preview);
        expect(useChatStore.getState().chatHistory[0].message).toBe(JSON.stringify({ text: 'hola https://example.com', linkPreview: preview }));
    });

    it('keeps local file transfer messages ordered by timestamp', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(200);

        useChatStore.setState({
            targetUpeerId: 'peer-1',
            activeGroupId: '',
            myIdentity,
            chatHistory: [
                {
                    id: 'msg-100',
                    upeerId: 'peer-1',
                    isMine: false,
                    message: 'primero',
                    status: 'read',
                    timestamp: '10:00',
                    date: 100,
                },
                {
                    id: 'msg-300',
                    upeerId: 'peer-1',
                    isMine: false,
                    message: 'tercero',
                    status: 'read',
                    timestamp: '10:03',
                    date: 300,
                }
            ],
            replyByConversation: { 'peer-1': null },
        });

        useChatStore.getState().addFileTransferMessage('peer-1', 'file-200', 'demo.txt', 1, 'text/plain', 'f'.repeat(64));

        expect(useChatStore.getState().chatHistory.map((message) => message.id)).toEqual(['msg-100', 'file-200', 'msg-300']);
        nowSpy.mockRestore();
    });
});
