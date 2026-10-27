import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerMessageHandlers } from '../../../../src/main_process/core/ipcHandlers/messages.js';
import { searchMessages } from '../../../../src/main_process/storage/messages/operations.js';

type SearchPayload = { query: string; limit?: number; offset?: number };
type SearchHandler = (event: unknown, payload: SearchPayload) => unknown;

const getSearchHandler = (): SearchHandler => {
    const call = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'search-messages');
    if (!call) throw new Error('Missing search-messages handler');
    return call[1] as SearchHandler;
};

vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn(),
        on: vi.fn(),
    },
}));

vi.mock('../../../../src/main_process/storage/messages/operations.js', () => ({
    getMessages: vi.fn(() => []),
    searchMessages: vi.fn(() => []),
    getMessagesAround: vi.fn(() => []),
    getFileHistory: vi.fn(() => []),
    getOlderMessages: vi.fn(() => []),
}));

vi.mock('../../../../src/main_process/network/messaging/chat.js', () => ({
    sendChatMessage: vi.fn(),
    sendTypingIndicator: vi.fn(),
    sendReadReceipt: vi.fn(),
    sendContactCard: vi.fn(),
    sendChatReaction: vi.fn(),
    sendChatUpdate: vi.fn(),
    sendChatDelete: vi.fn(),
}));

vi.mock('../../../../src/main_process/network/messaging/activity.js', () => ({
    markLocalActive: vi.fn(),
}));

describe('search-messages IPC handler', () => {
    beforeEach(() => {
        vi.mocked(ipcMain.handle).mockClear();
        vi.mocked(searchMessages).mockClear();
    });

    const search = (payload: SearchPayload) => {
        registerMessageHandlers();
        getSearchHandler()({}, payload);
        return vi.mocked(searchMessages).mock.calls.at(-1) ?? [];
    };

    it('traslada el término, el límite y el desplazamiento al almacenamiento', () => {
        expect(search({ query: 'ana', limit: 25, offset: 50 })).toEqual(['ana', 25, 50]);
    });

    it('aplica valores por defecto y recorta los límites fuera de rango', () => {
        expect(search({ query: 'ana' })).toEqual(['ana', 25, 0]);
        expect(search({ query: 'ana', limit: 0, offset: -5 })).toEqual(['ana', 1, 0]);
        expect(search({ query: 'ana', limit: 5000, offset: 2.7 })).toEqual(['ana', 100, 2]);
    });

    it('tolera una consulta que no es texto', () => {
        expect(search({ query: undefined as unknown as string })).toEqual(['', 25, 0]);
    });
});
