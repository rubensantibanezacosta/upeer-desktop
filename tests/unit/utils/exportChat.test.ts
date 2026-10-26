import { describe, expect, it } from 'vitest';
import { buildChatTranscript } from '../../../src/utils/exportChat.ts';
import type { ChatMessage } from '../../../src/types/chat.ts';

const message = (overrides: Partial<ChatMessage>): ChatMessage => ({
    upeerId: 'peer-1',
    isMine: false,
    message: '',
    status: 'sent',
    timestamp: '0',
    date: 0,
    ...overrides,
});

describe('buildChatTranscript', () => {
    it('incluye la cabecera con el nombre y el número de mensajes', () => {
        const text = buildChatTranscript({ chatName: 'Ana', meLabel: 'Yo', messages: [] });
        expect(text).toContain('Conversación: Ana');
        expect(text).toContain('Mensajes: 0');
    });

    it('etiqueta al autor propio y al ajeno', () => {
        const text = buildChatTranscript({
            chatName: 'Ana',
            meLabel: 'Yo',
            messages: [
                message({ isMine: true, message: 'hola', date: 1735689600000 }),
                message({ isMine: false, message: 'qué tal', date: 1735689660000, senderName: 'Ana' }),
            ],
        });
        expect(text).toContain('Yo: hola');
        expect(text).toContain('Ana: qué tal');
    });

    it('marca los mensajes eliminados y editados', () => {
        const text = buildChatTranscript({
            chatName: 'Ana',
            meLabel: 'Yo',
            messages: [
                message({ isMine: true, isDeleted: true, message: 'secreto' }),
                message({ isMine: true, isEdited: true, message: 'corregido' }),
            ],
        });
        expect(text).toContain('Yo: Mensaje eliminado');
        expect(text).toContain('Yo: corregido (editado)');
    });

    it('identifica los mensajes de sistema', () => {
        const text = buildChatTranscript({
            chatName: 'Grupo',
            meLabel: 'Yo',
            messages: [message({ isSystem: true, message: 'te uniste al grupo' })],
        });
        expect(text).toContain('Sistema: te uniste al grupo');
    });
});
