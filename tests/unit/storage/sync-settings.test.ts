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
        expect(patch).toEqual({ block: 'privacy', values: { readReceipts: false, shareActivity: true } });
    });

    it('acepta un parche de notificaciones', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'notifications', sound: false })).toEqual({
            block: 'notifications',
            values: { sound: false },
        });
    });

    it('descarta campos que pertenecen a otro bloque', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'privacy', readReceipts: false, sound: false })).toEqual({
            block: 'privacy',
            values: { readReceipts: false },
        });
    });

    it('rechaza un bloque desconocido', async () => {
        const { sanitizeSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-sync.js');
        expect(sanitizeSettingsPatch({ block: 'appearance', theme: 'dark' })).toBeNull();
        expect(sanitizeSettingsPatch({ block: 42 })).toBeNull();
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
