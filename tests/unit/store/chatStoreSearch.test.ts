import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '../../../src/store/useChatStore.js';
import { useChatActionsStore } from '../../../src/store/useChatActionsStore.js';
import type { Contact, Group, RawChatMessage } from '../../../src/types/chat.js';

const contact = (upeerId: string, name: string, overrides: Partial<Contact> = {}): Contact => ({
    upeerId,
    name,
    address: `300::${upeerId}`,
    status: 'connected',
    ...overrides,
});

const group: Group = {
    groupId: 'grp-1',
    name: 'Grupo Ana',
    adminUpeerId: 'me',
    members: ['me', 'ana'],
    status: 'active',
};

const raw = (id: string, chatUpeerId: string, message: string, timestamp: number): RawChatMessage => ({
    id,
    chatUpeerId,
    isMine: false,
    message,
    status: 'sent',
    timestamp,
});

describe('búsqueda global del chat store', () => {
    beforeEach(() => {
        useChatActionsStore.setState({ contactPrefs: {}, groupPrefs: {}, messagePrefs: {} });
        useChatStore.setState({
            contacts: [contact('ana', 'Ana', { lastMessage: 'hola', lastMessageTime: '2026-10-01T10:00:00.000Z' })],
            groups: [group],
            searchQuery: '',
            searchChip: 'all',
            searchSections: [],
            searchRawMessages: [],
            searchMessageLimit: 10,
            searchContactLimit: 5,
            searchLoading: { chats: false, contacts: false, groups: false, messages: false },
        });
    });

    it('busca las cuatro entidades y pagina los mensajes con limit y offset', async () => {
        const searchMessages = vi.fn(async () => [raw('m1', 'ana', 'Hola Ana', 1000)]);
        Object.defineProperty(window, 'upeer', { configurable: true, value: { searchMessages } });

        await useChatStore.getState().handleSearchGlobal('ana', 'all');

        expect(searchMessages).toHaveBeenCalledWith('ana', 25, 0);
        const kinds = useChatStore.getState().searchSections.map((section) => section.kind);
        expect(kinds).toEqual(['chats', 'contacts', 'groups', 'messages']);
        expect(useChatStore.getState().searchSections.find((section) => section.kind === 'messages')?.total).toBe(1);

        searchMessages.mockResolvedValueOnce([raw('m2', 'ana', 'Ana otra vez', 2000)]);
        await useChatStore.getState().loadMoreSearchMessages();

        expect(searchMessages).toHaveBeenLastCalledWith('ana', 25, 1);
        expect(useChatStore.getState().searchMessageLimit).toBe(35);
        expect(useChatStore.getState().searchSections.find((section) => section.kind === 'messages')?.total).toBe(2);
    });

    it('expone el loading de mensajes mientras el resto de secciones ya está resuelto', async () => {
        let resolve: (rows: RawChatMessage[]) => void = () => undefined;
        const pending = new Promise<RawChatMessage[]>((done) => { resolve = done; });
        Object.defineProperty(window, 'upeer', { configurable: true, value: { searchMessages: vi.fn(() => pending) } });

        const running = useChatStore.getState().handleSearchGlobal('ana', 'all');

        expect(useChatStore.getState().searchLoading).toEqual({ chats: false, contacts: false, groups: false, messages: true });
        expect(useChatStore.getState().searchSections.map((section) => section.kind)).toEqual(['chats', 'contacts', 'groups', 'messages']);

        resolve([]);
        await running;

        expect(useChatStore.getState().searchLoading).toEqual({ chats: false, contacts: false, groups: false, messages: false });
    });

    it('reutiliza los mensajes ya cargados al cambiar de chip sin volver a consultar', async () => {
        const searchMessages = vi.fn(async () => [raw('m1', 'ana', 'Hola Ana', 1000)]);
        Object.defineProperty(window, 'upeer', { configurable: true, value: { searchMessages } });

        await useChatStore.getState().handleSearchGlobal('ana', 'all');
        await useChatStore.getState().handleSearchGlobal('ana', 'favorites');

        expect(searchMessages).toHaveBeenCalledTimes(1);
        expect(useChatStore.getState().searchChip).toBe('favorites');
        expect(useChatStore.getState().searchSections.find((section) => section.kind === 'messages')?.total).toBe(0);
    });

    it('limpia el estado cuando el término queda vacío', async () => {
        useChatStore.setState({ searchQuery: 'ana', searchSections: [{ kind: 'chats', total: 1, items: [] }] });

        await useChatStore.getState().handleSearchGlobal('   ', 'all');

        expect(useChatStore.getState().searchQuery).toBe('');
        expect(useChatStore.getState().searchSections).toEqual([]);
    });

    it('amplía la sección de contactos sin recortar por el tope', async () => {
        const contacts = Array.from({ length: 7 }, (_, index) => contact(`ana-${index}`, `Ana ${index}`));
        useChatStore.setState({ contacts, groups: [] });
        Object.defineProperty(window, 'upeer', {
            configurable: true,
            value: { searchMessages: vi.fn(async () => []) },
        });

        await useChatStore.getState().handleSearchGlobal('ana', 'all');
        expect(useChatStore.getState().searchSections.find((section) => section.kind === 'contacts')?.items).toHaveLength(5);

        useChatStore.getState().showAllSearchContacts();
        expect(useChatStore.getState().searchSections.find((section) => section.kind === 'contacts')?.items).toHaveLength(7);
    });
});
