import type { NotificationKind } from '../security/notification-prefs.js';

export interface QueuedNotification {
    kind: NotificationKind;
    conversationId: string;
    title: string;
    body: string;
    onClick: () => void;
}

export interface NotificationGroup {
    kind: NotificationKind;
    title: string;
    body: string;
    onClick: () => void;
}

export const NOTIFICATION_GROUP_DELAY_MS = 900;

function plural(count: number, singular: string, many: string): string {
    return count === 1 ? `${count} ${singular}` : `${count} ${many}`;
}

export function summarizeNotifications(pending: readonly QueuedNotification[]): NotificationGroup | null {
    if (pending.length === 0) return null;
    if (pending.length === 1) {
        const [only] = pending;
        return { kind: only.kind, title: only.title, body: only.body, onClick: only.onClick };
    }
    const conversations = new Set(pending.map(item => item.conversationId));
    const last = pending[pending.length - 1];
    if (conversations.size === 1) {
        return {
            kind: last.kind,
            title: last.title,
            body: pending[0].kind === 'messages'
                ? `${plural(pending.length, 'mensaje nuevo', 'mensajes nuevos')}`
                : `${plural(pending.length, 'aviso nuevo', 'avisos nuevos')}`,
            onClick: last.onClick,
        };
    }
    return {
        kind: last.kind,
        title: 'uPeer',
        body: pending[0].kind === 'messages'
            ? `${plural(pending.length, 'mensaje nuevo', 'mensajes nuevos')} en ${plural(conversations.size, 'conversación', 'conversaciones')}`
            : `${plural(pending.length, 'aviso nuevo', 'avisos nuevos')} en ${plural(conversations.size, 'conversación', 'conversaciones')}`,
        onClick: last.onClick,
    };
}

export interface NotificationQueueOptions {
    present: (group: NotificationGroup) => void;
    delayMs?: number;
}

export interface NotificationQueue {
    push: (item: QueuedNotification) => void;
    flush: () => void;
    pending: () => number;
}

export function createNotificationQueue({ present, delayMs = NOTIFICATION_GROUP_DELAY_MS }: NotificationQueueOptions): NotificationQueue {
    let pending: QueuedNotification[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        if (pending.length === 0) return;
        const queued = pending;
        pending = [];
        const group = summarizeNotifications(queued);
        if (group) present(group);
    };

    return {
        push: item => {
            pending.push(item);
            if (timer !== null) return;
            timer = setTimeout(() => {
                timer = null;
                flush();
            }, delayMs);
        },
        flush,
        pending: () => pending.length,
    };
}
