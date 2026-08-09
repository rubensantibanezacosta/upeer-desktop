import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../../src/types/chat.js';

type MockUpeer = {
    sendMessage: ReturnType<typeof vi.fn>;
    getContacts: ReturnType<typeof vi.fn>;
    getMessages: ReturnType<typeof vi.fn>;
    getMyNetworkAddress: ReturnType<typeof vi.fn>;
    getMyIdentity: ReturnType<typeof vi.fn>;
};

function getUpeerMock(): MockUpeer {
    return (window as unknown as { upeer: MockUpeer }).upeer;
}

vi.mock('../../../src/utils/notificationSound.js', () => ({
    playNotificationSound: vi.fn(),
}));

function makeMessage(id: string, message: string, date: number, isMine: boolean): ChatMessage {
    return { id, upeerId: 'peer-1', isMine, message, status: 'read', timestamp: '10:00', date };
}

describe('orden cronológico al responder a un mensaje anterior', () => {
    beforeEach(async () => {
        vi.resetModules();
        delete (window as Window & { __chat_listeners_initialized?: boolean }).__chat_listeners_initialized;
        (window as unknown as { upeer: MockUpeer }).upeer = {
            sendMessage: vi.fn().mockResolvedValue({ id: 'R', savedMessage: 'respuesta', timestamp: 300 }),
            getContacts: vi.fn().mockResolvedValue([]),
            getMessages: vi.fn().mockResolvedValue([]),
            getMyNetworkAddress: vi.fn().mockResolvedValue('200::me'),
            getMyIdentity: vi.fn().mockResolvedValue({ upeerId: 'me', publicKey: 'pk', address: null, alias: 'Yo' }),
        };
    });

    it('inserta el mensaje de respuesta después de los anteriores (al final)', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');
        const original = makeMessage('A', 'mensaje original', 100, false);
        useChatStore.setState({
            targetUpeerId: 'peer-1',
            activeGroupId: '',
            chatHistory: [original, makeMessage('B', 'segundo', 200, false)],
            messagesByConversation: { 'peer-1': 'respuesta a A' },
            replyByConversation: { 'peer-1': original },
            myIdentity: { upeerId: 'me', publicKey: 'pk', address: null, alias: 'Yo' },
        });

        await useChatStore.getState().handleSend();

        const ids = useChatStore.getState().chatHistory.map((message) => message.id);
        expect(ids).toEqual(['A', 'B', 'R']);
        expect(getUpeerMock().sendMessage).toHaveBeenCalledWith('peer-1', 'respuesta a A', 'A', undefined);
    });

    it('mantiene la respuesta al final aunque su timestamp sea menor que otros por desfase de reloj', async () => {
        const { useChatStore } = await import('../../../src/store/useChatStore.js');
        // El contacto tiene el reloj adelantado: sus mensajes tienen timestamp 5000/6000.
        const original = makeMessage('A', 'original', 5000, false);
        useChatStore.setState({
            targetUpeerId: 'peer-1',
            activeGroupId: '',
            chatHistory: [original, makeMessage('B', 'segundo', 6000, false)],
            messagesByConversation: { 'peer-1': 'respuesta' },
            replyByConversation: { 'peer-1': original },
            myIdentity: { upeerId: 'me', publicKey: 'pk', address: null, alias: 'Yo' },
        });
        // Mi reloj es normal: el timestamp de envío (300) es menor que el del contacto.
        getUpeerMock().sendMessage.mockResolvedValue({ id: 'R', savedMessage: 'respuesta', timestamp: 300 });

        await useChatStore.getState().handleSend();

        const ids = useChatStore.getState().chatHistory.map((message) => message.id);
        expect(ids).toEqual(['A', 'B', 'R']);
    });
});
