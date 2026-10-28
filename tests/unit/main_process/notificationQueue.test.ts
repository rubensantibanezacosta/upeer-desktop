import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createNotificationQueue,
    summarizeNotifications,
    type NotificationGroup,
    type QueuedNotification,
} from '../../../src/main_process/utils/notificationQueue.js';

const click = vi.fn();

function message(conversationId: string, title: string, body: string): QueuedNotification {
    return { kind: 'messages', conversationId, title, body, onClick: click };
}

describe('summarizeNotifications', () => {
    it('no resume nada sin avisos pendientes', () => {
        expect(summarizeNotifications([])).toBeNull();
    });

    it('deja pasar un aviso único tal cual', () => {
        const only = message('u1', 'Ana', 'hola');
        const group = summarizeNotifications([only]);

        expect(group).toEqual({ kind: 'messages', title: 'Ana', body: 'hola', onClick: click });
    });

    it('agrupa varios mensajes de la misma conversación con su nombre', () => {
        const group = summarizeNotifications([
            message('u1', 'Ana', 'hola'),
            message('u1', 'Ana', 'qué tal'),
            message('u1', 'Ana', 'nos vemos'),
        ]);

        expect(group?.title).toBe('Ana');
        expect(group?.body).toBe('3 mensajes nuevos');
    });

    it('agrupa conversaciones distintas en un solo aviso y abre la última', () => {
        const last = vi.fn();
        const group = summarizeNotifications([
            message('u1', 'Ana', 'hola'),
            { kind: 'messages', conversationId: 'grp-aa', title: 'Beto → Equipo', body: 'arriba', onClick: last },
        ]);

        expect(group?.title).toBe('uPeer');
        expect(group?.body).toBe('2 mensajes nuevos en 2 conversaciones');
        group?.onClick();
        expect(last).toHaveBeenCalledTimes(1);
        expect(click).not.toHaveBeenCalled();
    });

    it('singulariza cuando solo hay una conversación con dos mensajes', () => {
        const group = summarizeNotifications([
            message('u1', 'Ana', 'hola'),
            message('u1', 'Ana', 'qué tal'),
        ]);

        expect(group?.body).toBe('2 mensajes nuevos');
    });

    it('no llama mensajes a otros tipos de aviso', () => {
        const first: QueuedNotification = { kind: 'requests', conversationId: 'u1', title: 'Solicitud', body: 'a', onClick: click };
        const second: QueuedNotification = { kind: 'requests', conversationId: 'u2', title: 'Solicitud', body: 'b', onClick: click };

        expect(summarizeNotifications([first, second])?.body).toBe('2 avisos nuevos en 2 conversaciones');
    });
});

describe('createNotificationQueue', () => {
    const present = vi.fn<(group: NotificationGroup) => void>();

    beforeEach(() => {
        vi.useFakeTimers();
        present.mockReset();
        click.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('no presenta nada hasta que vence la ventana', () => {
        const queue = createNotificationQueue({ present, delayMs: 500 });
        queue.push(message('u1', 'Ana', 'hola'));

        expect(present).not.toHaveBeenCalled();
        expect(queue.pending()).toBe(1);

        vi.advanceTimersByTime(499);
        expect(present).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(present).toHaveBeenCalledTimes(1);
        expect(present.mock.calls[0][0].body).toBe('hola');
        expect(queue.pending()).toBe(0);
    });

    it('agrupa lo que llega dentro de la ventana sin reiniciarla', () => {
        const queue = createNotificationQueue({ present, delayMs: 500 });
        queue.push(message('u1', 'Ana', 'hola'));
        vi.advanceTimersByTime(400);
        queue.push(message('u2', 'Beto', 'ey'));
        queue.push(message('u2', 'Beto', 'oye'));

        vi.advanceTimersByTime(100);

        expect(present).toHaveBeenCalledTimes(1);
        expect(present.mock.calls[0][0].body).toBe('3 mensajes nuevos en 2 conversaciones');
    });

    it('flush vacía lo pendiente sin esperar al temporizador', () => {
        const queue = createNotificationQueue({ present, delayMs: 500 });
        queue.push(message('u1', 'Ana', 'hola'));
        queue.flush();

        expect(present).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1000);
        expect(present).toHaveBeenCalledTimes(1);
    });

    it('abre una nueva ventana de agrupación después de presentar', () => {
        const queue = createNotificationQueue({ present, delayMs: 500 });
        queue.push(message('u1', 'Ana', 'hola'));
        vi.advanceTimersByTime(500);
        queue.push(message('u2', 'Beto', 'ey'));
        vi.advanceTimersByTime(500);

        expect(present).toHaveBeenCalledTimes(2);
        expect(present.mock.calls[1][0].body).toBe('ey');
    });

    it('flush sin pendientes no presenta nada', () => {
        const queue = createNotificationQueue({ present, delayMs: 500 });
        queue.flush();

        expect(present).not.toHaveBeenCalled();
    });
});
