import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockUpeer = {
    getMessages: ReturnType<typeof vi.fn>;
    getMessagesAround: ReturnType<typeof vi.fn>;
    getOlderMessages: ReturnType<typeof vi.fn>;
    getContacts: ReturnType<typeof vi.fn>;
    getGroups: ReturnType<typeof vi.fn>;
    getMyNetworkAddress: ReturnType<typeof vi.fn>;
    getMyIdentity: ReturnType<typeof vi.fn>;
};

function getUpeerMock(): MockUpeer {
    return (window as unknown as { upeer: MockUpeer }).upeer;
}

function setUpeerMock(mock: MockUpeer): void {
    (window as unknown as { upeer: MockUpeer }).upeer = mock;
}

vi.mock('../../../src/utils/notificationSound.js', () => ({
    playNotificationSound: vi.fn(),
}));

describe('loadOlderHistory', () => {
    beforeEach(async () => {
        vi.resetModules();
        delete (window as Window & { __chat_listeners_initialized?: boolean }).__chat_listeners_initialized;
        setUpeerMock({
            getMessages: vi.fn().mockResolvedValue([]),
            getMessagesAround: vi.fn().mockResolvedValue([]),
            getOlderMessages: vi.fn().mockResolvedValue([]),
            getContacts: vi.fn().mockResolvedValue([]),
            getGroups: vi.fn().mockResolvedValue([]),
            getMyNetworkAddress: vi.fn().mockResolvedValue('200::me'),
            getMyIdentity: vi.fn().mockResolvedValue({ upeerId: 'me', publicKey: 'pk', address: null, alias: 'Yo' }),
        });
    });

    it('antepone los mensajes más antiguos al historial actual de un contacto', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');

        useChatStore.setState({
            targetUpeerId: 'peer-1',
            activeGroupId: '',
            chatHistory: [
                { id: 'msg-100', upeerId: 'peer-1', isMine: false, message: 'viejo', status: 'read', timestamp: '10:00', date: 100 },
                { id: 'msg-200', upeerId: 'peer-1', isMine: false, message: 'nuevo', status: 'read', timestamp: '10:10', date: 200 },
            ],
        });

        getUpeerMock().getOlderMessages.mockResolvedValue([
            { id: 'msg-50', chatUpeerId: 'peer-1', message: 'mas viejo', timestamp: 50, isMine: false, senderUpeerId: 'peer-1' },
        ]);

        await useChatStore.getState().loadOlderHistory();

        expect(getUpeerMock().getOlderMessages).toHaveBeenCalledWith('peer-1', 100);
        expect(useChatStore.getState().chatHistory.map((message) => message.id)).toEqual(['msg-50', 'msg-100', 'msg-200']);
    });

    it('antepone mensajes más antiguos al historial de un grupo', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');

        useChatStore.setState({
            targetUpeerId: '',
            activeGroupId: 'grp-1',
            groupChatHistory: [
                { id: 'g-100', upeerId: 'grp-1', groupId: 'grp-1', isMine: false, message: 'viejo', status: 'read', timestamp: '10:00', date: 100 },
            ],
        });

        getUpeerMock().getOlderMessages.mockResolvedValue([
            { id: 'g-50', chatUpeerId: 'grp-1', message: 'mas viejo', timestamp: 50, isMine: false, senderUpeerId: 'peer-1' },
        ]);

        await useChatStore.getState().loadOlderHistory();

        expect(useChatStore.getState().groupChatHistory.map((message) => message.id)).toEqual(['g-50', 'g-100']);
    });

    it('no modifica el historial si no hay mensajes más antiguos', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');

        useChatStore.setState({
            targetUpeerId: 'peer-1',
            activeGroupId: '',
            chatHistory: [
                { id: 'msg-100', upeerId: 'peer-1', isMine: false, message: 'viejo', status: 'read', timestamp: '10:00', date: 100 },
            ],
        });

        getUpeerMock().getOlderMessages.mockResolvedValue([]);

        await useChatStore.getState().loadOlderHistory();

        expect(useChatStore.getState().chatHistory.map((message) => message.id)).toEqual(['msg-100']);
    });
});

