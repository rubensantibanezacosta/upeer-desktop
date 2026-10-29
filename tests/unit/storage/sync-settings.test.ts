import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, unknown>());

vi.mock('../../../src/main_process/storage/settings-operations.js', () => ({
    getAppSetting: (key: string, fallback: unknown) => (store.has(key) ? store.get(key) : fallback),
    setAppSetting: (key: string, value: unknown) => { store.set(key, value); },
}));

describe('settings-sync', () => {
    beforeEach(() => {
        store.clear();
    });

    it('acepta un parche de privacidad con sus dos campos', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        const patch = sanitizeSettingsPatch({ block: 'privacy', readReceipts: false, shareActivity: true });
        expect(patch).toEqual({ block: 'privacy', entity: 'privacy', values: { readReceipts: false, shareActivity: true } });
    });

    it('acepta un parche de notificaciones', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'notifications', sound: false })).toEqual({
            block: 'notifications',
            entity: 'notifications',
            values: { sound: false },
        });
    });

    it('descarta campos que pertenecen a otro bloque', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'privacy', readReceipts: false, sound: false })).toEqual({
            block: 'privacy',
            entity: 'privacy',
            values: { readReceipts: false },
        });
    });

    it('el plazo de un chat es su propia entidad', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'retention', chatId: 'abc', retention: '7d' })).toEqual({
            block: 'retention',
            entity: 'retention:abc',
            values: { chatId: 'abc', retention: '7d' },
        });
        expect(sanitizeSettingsPatch({ block: 'retention', chatId: '', retention: '7d' })).toBeNull();
        expect(sanitizeSettingsPatch({ block: 'retention', chatId: 42 })).toBeNull();
    });

    it('normaliza un plazo desconocido a desactivado', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'retention', chatId: 'abc', retention: 'dos días' })).toEqual({
            block: 'retention',
            entity: 'retention:abc',
            values: { chatId: 'abc', retention: 'off' },
        });
    });

    it('los ajustes de un chat son su propia entidad', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'chat', chatId: 'grp-1', muted: true, pinned: false })).toEqual({
            block: 'chat',
            entity: 'chat:grp-1',
            values: { chatId: 'grp-1', muted: true, pinned: false },
        });
    });

    it('un parche de chat sin banderas no vale', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'chat', chatId: 'grp-1' })).toBeNull();
        expect(sanitizeSettingsPatch({ block: 'chat', muted: true })).toBeNull();
        expect(sanitizeSettingsPatch({ block: 'chat', chatId: 'grp-1', muted: 'sí' })).toBeNull();
    });

    it('solo los bloques del renderer se pueden empujar desde la interfaz', async () => {
        const { isRendererBlock } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(isRendererBlock('chat')).toBe(true);
        expect(isRendererBlock('message')).toBe(true);
        expect(isRendererBlock('privacy')).toBe(false);
        expect(isRendererBlock('retention')).toBe(false);
        expect(isRendererBlock('appearance')).toBe(false);
    });

    it('los destacados de un mensaje son su propia entidad', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'message', messageId: ' m1 ', starred: true, chatId: 'x' })).toEqual({
            block: 'message',
            entity: 'message:m1',
            values: { messageId: 'm1', starred: true },
        });
    });

    it('un parche de mensaje sin banderas ni id no vale', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'message', messageId: 'm1' })).toBeNull();
        expect(sanitizeSettingsPatch({ block: 'message', starred: true })).toBeNull();
        expect(sanitizeSettingsPatch({ block: 'message', messageId: '', starred: true })).toBeNull();
    });

    it('una lista de chats viaja con su nombre y sus chats', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'lists', listId: 'l1', name: '  Trabajo ', chatIds: ['a', 'a', 'b'] })).toEqual({
            block: 'lists',
            entity: 'lists:l1',
            values: { listId: 'l1', name: 'Trabajo', chatIds: ['a', 'b'] },
        });
    });

    it('borrar una lista viaja como marca, no como lista vacía', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'lists', listId: 'l1', deleted: true })).toEqual({
            block: 'lists',
            entity: 'lists:l1',
            values: { listId: 'l1', deleted: true },
        });
    });

    it('una lista sin nombre ni marca de borrado no vale', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'lists', listId: 'l1' })).toBeNull();
        expect(sanitizeSettingsPatch({ block: 'lists', name: 'Trabajo' })).toBeNull();
        expect(sanitizeSettingsPatch({ block: 'lists', listId: 'l1', name: '   ' })).toBeNull();
    });

    it('la lista es un bloque del renderer', async () => {
        const { isRendererBlock } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(isRendererBlock('lists')).toBe(true);
    });

    it('rechaza un bloque desconocido', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'appearance', theme: 'dark' })).toBeNull();
        expect(sanitizeSettingsPatch({ block: 42 })).toBeNull();
    });

    it('el bloqueo de un contacto viaja con su identificador', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'blocked', upeerId: 'peer-1', blocked: true })).toEqual({
            block: 'blocked',
            entity: 'blocked:peer-1',
            values: { upeerId: 'peer-1', blocked: true },
        });
        expect(sanitizeSettingsPatch({ block: 'blocked', upeerId: 'peer-1', blocked: false })).toEqual({
            block: 'blocked',
            entity: 'blocked:peer-1',
            values: { upeerId: 'peer-1', blocked: false },
        });
    });

    it('el bloqueo viaja sin identificador o sin marca no vale', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'blocked', blocked: true })).toBeNull();
        expect(sanitizeSettingsPatch({ block: 'blocked', upeerId: 'peer-1' })).toBeNull();
        expect(sanitizeSettingsPatch({ block: 'blocked', upeerId: 'peer-1', blocked: 'si' })).toBeNull();
    });

    it('el bloqueo lo aplica el proceso principal, no el renderer', async () => {
        const { isRendererBlock } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(isRendererBlock('blocked')).toBe(false);
    });

    it('rechaza un parche sin valores utilizables', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'privacy' })).toBeNull();
        expect(sanitizeSettingsPatch({ block: 'privacy', readReceipts: 'no' })).toBeNull();
    });

    it('el primero que llega se acepta y el más antiguo pierde', async () => {
        const { claimSettingsUpdate, setSettingsClock } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(claimSettingsUpdate('privacy', 1_000)).toBe(true);
        setSettingsClock('privacy', 1_000);
        expect(claimSettingsUpdate('privacy', 1_000)).toBe(false);
        expect(claimSettingsUpdate('privacy', 999)).toBe(false);
        expect(claimSettingsUpdate('privacy', 1_001)).toBe(true);
    });

    it('cada bloque lleva su propio reloj', async () => {
        const { claimSettingsUpdate, setSettingsClock } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        setSettingsClock('privacy', 5_000);
        expect(claimSettingsUpdate('notifications', 1)).toBe(true);
    });

    it('ignora marcas de tiempo imposibles', async () => {
        const { claimSettingsUpdate, setSettingsClock, settingsClock } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        setSettingsClock('privacy', 0);
        setSettingsClock('privacy', Number.NaN);
        expect(settingsClock('privacy')).toBe(0);
        expect(claimSettingsUpdate('privacy', 0)).toBe(false);
        expect(claimSettingsUpdate('privacy', Number.NaN)).toBe(false);
    });
});
