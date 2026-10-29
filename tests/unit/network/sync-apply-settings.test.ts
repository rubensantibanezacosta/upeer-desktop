import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncPlainEvent } from '../../../src/main_process/network/sync/types.js';

const settings = vi.hoisted(() => new Map<string, unknown>());

vi.mock('../../../src/main_process/storage/settings-operations.js', () => ({
    getAppSetting: (key: string, fallback: unknown) => (settings.has(key) ? settings.get(key) : fallback),
    setAppSetting: (key: string, value: unknown) => { settings.set(key, value); },
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    deleteMessageLocally: vi.fn(),
    deleteMessagesByChatId: vi.fn(),
    getMessageById: vi.fn(),
    updateMessageContent: vi.fn(),
    updateMessageStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/status.js', () => ({}));
vi.mock('../../../src/main_process/storage/messages/reactions.js', () => ({
    deleteReaction: vi.fn(),
    saveReaction: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    deleteGroup: vi.fn(),
    upsertGroupMetadata: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(() => null),
    setContactFavorite: vi.fn(),
    updateContactAvatar: vi.fn(),
    updateContactName: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/sync/messages.js', () => ({
    upsertSyncMessage: vi.fn(() => ({ applied: false, inserted: false })),
}));

function event(payload: Record<string, unknown>, occurredAt = 2_000): SyncPlainEvent {
    return {
        eventId: `settings-${occurredAt}`,
        kind: 'SETTINGS_UPDATE',
        occurredAt,
        sequence: occurredAt,
        payload,
    } as SyncPlainEvent;
}

function windowDouble() {
    return { webContents: { send: vi.fn() } } as unknown as Parameters<
        typeof import('../../../src/main_process/network/sync/apply.js').applySyncEvent
    >[1] & { webContents: { send: ReturnType<typeof vi.fn> } };
}

describe('applySyncEvent con ajustes', () => {
    beforeEach(() => {
        settings.clear();
        settings.set('privacy-prefs', { readReceipts: true, shareActivity: true });
        settings.set('notification-prefs', { messages: true, requests: true, sound: true });
    });

    it('aplica un cambio de privacidad llegado de otro dispositivo', async () => {
        const { applySyncEvent } = await import('../../../src/main_process/network/sync/apply.js');
        const { getPrivacyPrefs } = await import('../../../src/main_process/security/privacy-prefs.js');
        const win = windowDouble();

        const applied = await applySyncEvent(event({ block: 'privacy', shareActivity: false }), win);

        expect(applied).toBe(true);
        expect(getPrivacyPrefs()).toEqual({ readReceipts: true, shareActivity: false });
        expect(win.webContents.send).toHaveBeenCalledWith('settings-updated', {
            block: 'privacy',
            entity: 'privacy',
            values: { readReceipts: true, shareActivity: false },
        });
    });

    it('aplica un cambio de notificaciones sin tocar el resto', async () => {
        const { applySyncEvent } = await import('../../../src/main_process/network/sync/apply.js');
        const { getNotificationPrefs } = await import('../../../src/main_process/security/notification-prefs.js');

        const applied = await applySyncEvent(event({ block: 'notifications', sound: false }), null);

        expect(applied).toBe(true);
        expect(getNotificationPrefs()).toEqual({ messages: true, requests: true, sound: false });
    });

    it('ignora un evento más antiguo que el último aplicado', async () => {
        const { applySyncEvent } = await import('../../../src/main_process/network/sync/apply.js');
        const { getPrivacyPrefs } = await import('../../../src/main_process/security/privacy-prefs.js');

        expect(await applySyncEvent(event({ block: 'privacy', readReceipts: false }, 5_000), null)).toBe(true);
        expect(await applySyncEvent(event({ block: 'privacy', readReceipts: true }, 4_000), null)).toBe(false);
        expect(getPrivacyPrefs().readReceipts).toBe(false);
    });

    it('rechaza un payload sin bloque conocido', async () => {
        const { applySyncEvent } = await import('../../../src/main_process/network/sync/apply.js');
        const win = windowDouble();

        expect(await applySyncEvent(event({ block: 'appearance', theme: 'dark' }), win)).toBe(false);
        expect(win.webContents.send).not.toHaveBeenCalled();
    });

    it('rechaza un parche vacío', async () => {
        const { applySyncEvent } = await import('../../../src/main_process/network/sync/apply.js');
        expect(await applySyncEvent(event({ block: 'privacy' }), null)).toBe(false);
    });

    it('aplica el plazo de un chat y lo avisa con su entidad', async () => {
        const { applySyncEvent } = await import('../../../src/main_process/network/sync/apply.js');
        const { getChatRetentionId } = await import('../../../src/main_process/storage/retention/chatRetention.js');
        const win = windowDouble();

        const applied = await applySyncEvent(event({ block: 'retention', chatId: 'chat-1', retention: '7d' }), win);

        expect(applied).toBe(true);
        expect(getChatRetentionId('chat-1')).toBe('7d');
        expect(win.webContents.send).toHaveBeenCalledWith('settings-updated', {
            block: 'retention',
            entity: 'retention:chat-1',
            values: { chatId: 'chat-1', retention: '7d' },
        });
    });

    it('desactivar el plazo borra la entrada del chat', async () => {
        const { applySyncEvent } = await import('../../../src/main_process/network/sync/apply.js');
        const { getChatRetentionId, getRetentionMap } = await import('../../../src/main_process/storage/retention/chatRetention.js');

        await applySyncEvent(event({ block: 'retention', chatId: 'chat-2', retention: '24h' }, 3_000), null);
        await applySyncEvent(event({ block: 'retention', chatId: 'chat-2', retention: 'off' }, 4_000), null);

        expect(getChatRetentionId('chat-2')).toBe('off');
        expect(getRetentionMap()['chat-2']).toBeUndefined();
    });

    it('rechaza un plazo más antiguo que el del mismo chat', async () => {
        const { applySyncEvent } = await import('../../../src/main_process/network/sync/apply.js');
        const { getChatRetentionId } = await import('../../../src/main_process/storage/retention/chatRetention.js');

        expect(await applySyncEvent(event({ block: 'retention', chatId: 'chat-3', retention: '90d' }, 9_000), null)).toBe(true);
        expect(await applySyncEvent(event({ block: 'retention', chatId: 'chat-3', retention: '24h' }, 8_000), null)).toBe(false);
        expect(getChatRetentionId('chat-3')).toBe('90d');
    });

    it('los ajustes de un chat se reenvían al renderer con su entidad', async () => {
        const { applySyncEvent } = await import('../../../src/main_process/network/sync/apply.js');
        const win = windowDouble();

        const applied = await applySyncEvent(event({ block: 'chat', chatId: 'grp-7', muted: true }, 6_000), win);

        expect(applied).toBe(true);
        expect(win.webContents.send).toHaveBeenCalledWith('settings-updated', {
            block: 'chat',
            entity: 'chat:grp-7',
            values: { chatId: 'grp-7', muted: true },
        });
    });

    it('un ajuste de chat más antiguo que el último aplicado no se reenvía', async () => {
        const { applySyncEvent } = await import('../../../src/main_process/network/sync/apply.js');
        const win = windowDouble();

        expect(await applySyncEvent(event({ block: 'chat', chatId: 'grp-8', pinned: true }, 7_000), win)).toBe(true);
        expect(await applySyncEvent(event({ block: 'chat', chatId: 'grp-8', pinned: false }, 6_000), win)).toBe(false);
        expect(win.webContents.send).toHaveBeenCalledTimes(1);
    });
});
