import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '../../../src/store/useChatStore.js';
import type { Contact, Group, RawChatMessage } from '../../../src/types/chat.js';

const contact = (upeerId: string, name: string): Contact => ({
    upeerId,
    name,
    address: `300::${upeerId}`,
    status: 'connected',
});

const group: Group = {
    groupId: 'grp-1',
    name: 'Grupo Ana',
    adminUpeerId: 'me',
    members: ['me', 'ana'],
    status: 'active',
};

const raw = (id: string, chatUpeerId: string, timestamp: number): RawChatMessage => ({
    id,
    chatUpeerId,
    isMine: false,
    message: 'hola',
    status: 'sent',
    timestamp,
});

const installBridge = (overrides: Record<string, unknown>): void => {
    Object.defineProperty(window, 'upeer', {
        configurable: true,
        value: {
            getMessages: async () => [],
            getMessagesAround: async () => [],
            sendReadReceipt: () => undefined,
            ...overrides,
        },
    });
};

describe('carga de historial por conversación', () => {
    beforeEach(() => {
        useChatStore.setState({
            contacts: [contact('ana', 'Ana')],
            groups: [group],
            targetUpeerId: '',
            activeGroupId: '',
            chatHistory: [],
            groupChatHistory: [],
            historyLoadingByChat: {},
        });
    });

    it('marca solo el chat que se abre y lo desmarca al terminar', async () => {
        let resolveMessages: (messages: RawChatMessage[]) => void = () => undefined;
        installBridge({
            getMessages: () => new Promise<RawChatMessage[]>((resolve) => {
                resolveMessages = resolve;
            }),
        });

        useChatStore.getState().setTargetUpeerId('ana');

        expect(useChatStore.getState().historyLoadingByChat).toEqual({ ana: true });

        resolveMessages([raw('m1', 'ana', 1000)]);
        await vi.waitFor(() => {
            expect(useChatStore.getState().historyLoadingByChat).toEqual({});
        });
        expect(useChatStore.getState().chatHistory).toHaveLength(1);
    });

    it('un grupo vacío deja de estar cargando cuando la consulta termina', async () => {
        installBridge({ getMessages: async () => [] });

        useChatStore.getState().setActiveGroupId('grp-1');

        await vi.waitFor(() => {
            expect(useChatStore.getState().historyLoadingByChat).toEqual({});
        });
        expect(useChatStore.getState().groupChatHistory).toHaveLength(0);
    });

    it('no deja el grupo cargando para siempre al cambiar de conversación', async () => {
        installBridge({ getMessages: async () => [raw('g1', 'grp-1', 2000)] });

        useChatStore.getState().setActiveGroupId('grp-1');
        await vi.waitFor(() => {
            expect(useChatStore.getState().groupChatHistory).toHaveLength(1);
        });
        expect(useChatStore.getState().historyLoadingByChat['grp-1']).toBeUndefined();

        useChatStore.getState().setTargetUpeerId('ana');
        expect(useChatStore.getState().historyLoadingByChat).toEqual({ ana: true });

        await vi.waitFor(() => {
            expect(useChatStore.getState().historyLoadingByChat).toEqual({});
        });
    });

    it('limpia la marca cuando la consulta falla', async () => {
        installBridge({ getMessages: async () => Promise.reject(new Error('db cerrada')) });

        useChatStore.getState().setTargetUpeerId('ana');

        await vi.waitFor(() => {
            expect(useChatStore.getState().historyLoadingByChat).toEqual({});
        });
    });

    it('cerrar la conversación no deja marcas colgando', async () => {
        installBridge({ getMessages: async () => [] });

        useChatStore.getState().setTargetUpeerId('ana');
        await vi.waitFor(() => {
            expect(useChatStore.getState().historyLoadingByChat).toEqual({});
        });

        useChatStore.getState().setTargetUpeerId('');
        expect(useChatStore.getState().historyLoadingByChat).toEqual({});
    });
});
