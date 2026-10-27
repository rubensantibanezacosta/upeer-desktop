import { describe, expect, it } from 'vitest';
import { collectStarred } from '../../../../src/features/chat/starredMessages.js';
import type { ChatMessage } from '../../../../src/types/chat.js';
import type { MessageActionPrefs } from '../../../../src/store/useChatActionsStore.js';

const message = (overrides: Partial<ChatMessage>): ChatMessage => ({
    id: 'msg',
    upeerId: 'peer',
    isMine: false,
    message: 'Hola',
    status: 'sent',
    timestamp: '1000',
    date: 1000,
    ...overrides,
});

const starred = (value = true): MessageActionPrefs => ({ pinned: false, reported: false, starred: value });

describe('collectStarred', () => {
    it('devuelve solo los mensajes marcados como destacados', () => {
        const history = [message({ id: 'a' }), message({ id: 'b', message: 'Adiós' })];
        const result = collectStarred(history, { a: starred() });
        expect(result.map((entry) => entry.id)).toEqual(['a']);
        expect(result[0].summary).toEqual({ kind: 'text', label: 'Hola' });
    });

    it('ordena de más reciente a más antiguo', () => {
        const history = [message({ id: 'a', timestamp: '1000' }), message({ id: 'b', timestamp: '3000' })];
        const result = collectStarred(history, { a: starred(), b: starred() });
        expect(result.map((entry) => entry.id)).toEqual(['b', 'a']);
    });

    it('ignora los destacados sin mensaje en el historial y los borrados', () => {
        const history = [message({ id: 'a', isDeleted: true }), message({ id: 'b' })];
        const result = collectStarred(history, { a: starred(), b: starred(), eliminado: starred() });
        expect(result.map((entry) => entry.id)).toEqual(['b']);
    });

    it('clasifica las notas de voz y los adjuntos', () => {
        const history = [
            message({ id: 'voz', message: JSON.stringify({ type: 'file', fileName: 'audio.m4a', isVoiceNote: true }) }),
            message({ id: 'archivo', message: JSON.stringify({ type: 'file', fileName: 'informe.pdf' }) }),
        ];
        const result = collectStarred(history, { voz: starred(), archivo: starred() });
        expect(result.find((entry) => entry.id === 'voz')?.summary.kind).toBe('voice');
        expect(result.find((entry) => entry.id === 'archivo')?.summary.kind).toBe('file');
    });

    it('sin historial ni preferencias devuelve una lista vacía', () => {
        expect(collectStarred([], {})).toEqual([]);
    });
});
