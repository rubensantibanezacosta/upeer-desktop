import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, unknown>());
const handlers = vi.hoisted(() => new Map<string, (event: unknown, payload?: unknown) => unknown>());
const emitted = vi.hoisted(() => [] as Array<{ kind: string; payload: Record<string, unknown> }>);

vi.mock('../../../src/main_process/storage/settings-operations.js', () => ({
    getAppSetting: (key: string, fallback: unknown) => (store.has(key) ? store.get(key) : fallback),
    setAppSetting: (key: string, value: unknown) => { store.set(key, value); },
}));

vi.mock('electron', () => ({
    ipcMain: {
        handle: (channel: string, handler: (event: unknown, payload?: unknown) => unknown) => {
            handlers.set(channel, handler);
        },
    },
}));

vi.mock('../../../src/main_process/storage/sync/eventSink.js', () => ({
    emitSyncEvent: (kind: string, payload: Record<string, unknown>) => { emitted.push({ kind, payload }); },
}));

async function load() {
    vi.resetModules();
    const { registerSettingsSyncHandlers } = await import('../../../src/main_process/core/ipcHandlers/settingsSync.js');
    registerSettingsSyncHandlers();
    return handlers;
}

describe('canales IPC de ajustes sincronizados', () => {
    beforeEach(() => {
        store.clear();
        handlers.clear();
        emitted.length = 0;
    });

    it('registra la subida, la lectura de pendientes y la confirmación', async () => {
        await load();
        expect([...handlers.keys()].sort()).toEqual([
            'ack-settings-patch',
            'emit-settings-patch',
            'get-pending-settings-patches',
        ]);
    });

    it('la subida emite el parche del renderer', async () => {
        const channels = await load();
        const result = channels.get('emit-settings-patch')?.(null, { block: 'chat', chatId: 'c1', muted: true });
        expect(result).toEqual({ ok: true });
        expect(emitted).toEqual([{ kind: 'SETTINGS_UPDATE', payload: { block: 'chat', chatId: 'c1', muted: true } }]);
    });

    it('la subida rechaza bloques que no son del renderer', async () => {
        const channels = await load();
        expect(channels.get('emit-settings-patch')?.(null, { block: 'privacy', shareActivity: false })).toEqual({ ok: false });
        expect(channels.get('emit-settings-patch')?.(null, { block: 'chat' })).toEqual({ ok: false });
        expect(emitted).toEqual([]);
    });

    it('drena y confirma un parche pendiente', async () => {
        const channels = await load();
        channels.get('emit-settings-patch')?.(null, { block: 'chat', chatId: 'c2', pinned: true });
        store.set('settings-renderer-inbox', {
            'chat:c2': { block: 'chat', entity: 'chat:c2', values: { chatId: 'c2', pinned: true }, occurredAt: 1_500 },
        });

        const pending = channels.get('get-pending-settings-patches')?.(null) as { patches: Array<{ entity: string }> };
        expect(pending.patches.map((patch) => patch.entity)).toEqual(['chat:c2']);

        expect(channels.get('ack-settings-patch')?.(null, { entity: 'chat:c2', occurredAt: 1_500 })).toEqual({ ok: true });
        expect(channels.get('get-pending-settings-patches')?.(null)).toEqual({ patches: [] });
    });

    it('la confirmación exige entidad y marca válidas', async () => {
        const channels = await load();
        expect(channels.get('ack-settings-patch')?.(null, {})).toEqual({ ok: false });
        expect(channels.get('ack-settings-patch')?.(null, { entity: 'chat:x' })).toEqual({ ok: false });
        expect(channels.get('ack-settings-patch')?.(null, { entity: 'chat:x', occurredAt: 0 })).toEqual({ ok: false });
        expect(channels.get('ack-settings-patch')?.(null, { entity: '', occurredAt: 10 })).toEqual({ ok: false });
    });
});
