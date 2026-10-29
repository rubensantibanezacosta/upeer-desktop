import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { renderGroupLastMessage } from '../../../../src/components/layout/groupItemSupport.js';
import { renderLastMessagePreview, renderMessageStatusIcon } from '../../../../src/components/layout/contactItemSupport.js';
import type { Contact, Group } from '../../../../src/types/chat.js';

const group = (lastMessage: string) => ({
    groupId: 'grp-1',
    name: 'grupo',
    members: ['a', 'b'],
    lastMessage,
    lastMessageTime: undefined,
    lastMessageStatus: undefined,
    lastMessageIsMine: false,
}) as unknown as Group;

const contact = (lastMessage: string) => ({
    upeerId: 'a'.repeat(64),
    name: 'Ivan',
    status: 'connected',
    lastMessage,
    lastMessageTime: undefined,
    lastMessageStatus: undefined,
    lastMessageIsMine: false,
}) as unknown as Contact;

const text = (node: React.ReactNode) => {
    const { container } = render(<>{node}</>);
    return container.textContent;
};

describe('renderGroupLastMessage', () => {
    it('muestra el texto de una invitación sin el prefijo de sistema', () => {
        expect(text(renderGroupLastMessage(group('__SYS__|Rubén te añadió al grupo'), ''))).toBe('Rubén te añadió al grupo');
    });

    it('resume un evento de llamada en lugar de enseñar el prefijo', () => {
        expect(text(renderGroupLastMessage(group('__SYS__|Videollamada · 01:30 · 1792065600000'), ''))).toBe('Videollamada · 01:30');
    });

    it('cuenta los miembros cuando el grupo no tiene mensajes', () => {
        expect(renderGroupLastMessage({ groupId: 'grp-1', name: 'grupo', members: ['a', 'b', 'c'] } as unknown as Group, '')).toBe('3 miembros');
    });

    it('nombra la nota de voz y el fichero', () => {
        expect(text(renderGroupLastMessage(group(JSON.stringify({ type: 'file', fileName: 'nota.webm', isVoiceNote: true })), ''))).toBe('Nota de voz');
        expect(text(renderGroupLastMessage(group(JSON.stringify({ type: 'file', fileName: 'informe.pdf', mimeType: 'application/pdf' })), ''))).toBe('informe.pdf');
    });

    it('resume la tarjeta de contacto', () => {
        const card = JSON.stringify({ type: 'contact_card', contact: { name: 'Ana', upeerId: 'b'.repeat(64) } });
        expect(renderGroupLastMessage(group(card), '')).toBe('Tarjeta de contacto');
    });

    it('describe la reacción con quién reaccionó y a qué mensaje', () => {
        const entry = group('mensaje antiguo') as Group;
        entry.latestReaction = {
            emoji: '🔥',
            message: 'mensaje antiguo',
            timestamp: 10,
            actorUpeerId: 'b'.repeat(64),
            actorName: 'Ivan',
            actorIsMe: false,
        };
        expect(text(renderGroupLastMessage(entry, ''))).toBe('Ivan reaccionó con 🔥 al mensaje "mensaje antiguo"');
    });

    it('describe el aviso reaccionado cuando el mensaje es de sistema', () => {
        const entry = group('') as Group;
        entry.latestReaction = {
            emoji: '👍',
            message: '__SYS__|Ivan dejó el grupo',
            timestamp: 10,
            actorUpeerId: 'b'.repeat(64),
            actorName: 'Ivan',
            actorIsMe: false,
        };
        expect(text(renderGroupLastMessage(entry, ''))).toBe('Ivan reaccionó con 👍 al aviso "Ivan dejó el grupo"');
    });
});

describe('renderLastMessagePreview', () => {
    it('quita el prefijo de sistema y resume las llamadas', () => {
        expect(text(renderLastMessagePreview(contact('__SYS__|Ivan dejó el grupo'), ''))).toBe('Ivan dejó el grupo');
        expect(text(renderLastMessagePreview(contact('__SYS__|Llamada de voz perdida'), ''))).toBe('Llamada de voz perdida');
    });

    it('nombra la nota de voz del contacto', () => {
        expect(text(renderLastMessagePreview(contact(JSON.stringify({ type: 'file', fileName: 'nota.webm', isVoiceNote: true })), ''))).toBe('Nota de voz');
    });

    it('describe la reacción del contacto sobre el último mensaje', () => {
        const entry = contact('mensaje antiguo') as Contact;
        entry.latestReaction = {
            emoji: '🤙',
            message: 'mensaje antiguo',
            timestamp: 10,
            actorUpeerId: 'a'.repeat(64),
            actorName: 'Ivan',
            actorIsMe: false,
        };
        expect(text(renderLastMessagePreview(entry, ''))).toBe('Ivan reaccionó con 🤙 al mensaje "mensaje antiguo"');
    });

    it('nombra el adjunto reaccionado', () => {
        const entry = contact('') as Contact;
        entry.latestReaction = {
            emoji: '❤️',
            message: JSON.stringify({ type: 'file', fileName: 'informe.pdf', mimeType: 'application/pdf' }),
            timestamp: 10,
            actorUpeerId: 'a'.repeat(64),
            actorName: 'Ivan',
            actorIsMe: false,
        };
        expect(text(renderLastMessagePreview(entry, ''))).toBe('Ivan reaccionó con ❤️ al archivo "informe.pdf"');
    });

    it('no pinta el estado del mensaje cuando lo último es una reacción', () => {
        const entry = contact('mensaje') as Contact;
        entry.lastMessageIsMine = true;
        entry.lastMessageStatus = 'read';
        entry.latestReaction = {
            emoji: '👍',
            message: 'mensaje',
            timestamp: 10,
            actorUpeerId: 'a'.repeat(64),
            actorName: 'Ivan',
            actorIsMe: false,
        };
        expect(renderMessageStatusIcon(entry)).toBeNull();
    });
});
