import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, unknown>());

vi.mock('../../../src/main_process/storage/settings-operations.js', () => ({
    getAppSetting: (key: string, fallback: unknown) => (store.has(key) ? store.get(key) : fallback),
    setAppSetting: (key: string, value: unknown) => { store.set(key, value); },
}));

type Patch = Parameters<
    typeof import('../../../src/main_process/storage/sync/settings-inbox.js').queueRendererSettingsPatch
>[0];

function chatPatch(entity: string, muted: boolean): Patch {
    return { block: 'chat', entity, values: { chatId: entity.slice('chat:'.length), muted } };
}

describe('bandeja de ajustes para el renderer', () => {
    beforeEach(() => {
        store.clear();
    });

    it('guarda un parche de chat hasta que el renderer lo confirma', async () => {
        const { listRendererSettingsPatches, queueRendererSettingsPatch } =
            await import('../../../src/main_process/storage/sync/settings-inbox.js');
        queueRendererSettingsPatch(chatPatch('chat:a', true), 1_000);
        expect(listRendererSettingsPatches()).toEqual([
            { block: 'chat', entity: 'chat:a', values: { chatId: 'a', muted: true }, occurredAt: 1_000 },
        ]);
    });

    it('solo se queda con la marca más nueva de cada entidad', async () => {
        const { listRendererSettingsPatches, queueRendererSettingsPatch } =
            await import('../../../src/main_process/storage/sync/settings-inbox.js');
        queueRendererSettingsPatch(chatPatch('chat:a', true), 1_000);
        queueRendererSettingsPatch(chatPatch('chat:a', false), 2_000);
        queueRendererSettingsPatch(chatPatch('chat:a', true), 1_500);
        expect(listRendererSettingsPatches()).toEqual([
            { block: 'chat', entity: 'chat:a', values: { chatId: 'a', muted: false }, occurredAt: 2_000 },
        ]);
    });

    it('entrega las entidades de la más antigua a la más nueva', async () => {
        const { listRendererSettingsPatches, queueRendererSettingsPatch } =
            await import('../../../src/main_process/storage/sync/settings-inbox.js');
        queueRendererSettingsPatch({ block: 'lists', entity: 'lists:l2', values: { listId: 'l2', name: 'Dos', chatIds: [] } }, 3_000);
        queueRendererSettingsPatch(chatPatch('chat:a', true), 1_000);
        queueRendererSettingsPatch({ block: 'message', entity: 'message:m1', values: { messageId: 'm1', starred: true } }, 2_000);
        expect(listRendererSettingsPatches().map((patch) => patch.entity)).toEqual(['chat:a', 'message:m1', 'lists:l2']);
    });

    it('confirmar una entidad la saca de la bandeja', async () => {
        const { ackRendererSettingsPatch, listRendererSettingsPatches, queueRendererSettingsPatch } =
            await import('../../../src/main_process/storage/sync/settings-inbox.js');
        queueRendererSettingsPatch(chatPatch('chat:a', true), 1_000);
        queueRendererSettingsPatch(chatPatch('chat:b', true), 1_100);
        expect(ackRendererSettingsPatch('chat:a', 1_000)).toBe(true);
        expect(listRendererSettingsPatches().map((patch) => patch.entity)).toEqual(['chat:b']);
    });

    it('no confirma una marca más nueva que la confirmada', async () => {
        const { ackRendererSettingsPatch, listRendererSettingsPatches, queueRendererSettingsPatch } =
            await import('../../../src/main_process/storage/sync/settings-inbox.js');
        queueRendererSettingsPatch(chatPatch('chat:a', false), 2_000);
        queueRendererSettingsPatch(chatPatch('chat:a', true), 1_000);
        expect(ackRendererSettingsPatch('chat:a', 1_000)).toBe(false);
        expect(listRendererSettingsPatches()).toHaveLength(1);
    });

    it('confirma un parche que ya se había confirmado sin efectos', async () => {
        const { ackRendererSettingsPatch } = await import('../../../src/main_process/storage/sync/settings-inbox.js');
        expect(ackRendererSettingsPatch('chat:nadie', 1_000)).toBe(false);
    });

    it('descarta lo guardado que no se reconoce al leer', async () => {
        const { listRendererSettingsPatches } = await import('../../../src/main_process/storage/sync/settings-inbox.js');
        store.set('settings-renderer-inbox', {
            'chat:roto': { block: 'chat' },
            'chat:vacio': { block: 'chat', values: null, occurredAt: 1_000 },
            'privacidad': { block: 'privacy', values: {}, occurredAt: 1_000 },
            'chat:bueno': { block: 'chat', values: { chatId: 'bueno', muted: true }, occurredAt: 1_000 },
        });
        expect(listRendererSettingsPatches().map((patch) => patch.entity)).toEqual(['chat:bueno']);
    });

    it('vaciar la bandeja deja de devolver parches', async () => {
        const { clearRendererSettingsInbox, listRendererSettingsPatches, queueRendererSettingsPatch } =
            await import('../../../src/main_process/storage/sync/settings-inbox.js');
        queueRendererSettingsPatch(chatPatch('chat:a', true), 1_000);
        clearRendererSettingsInbox();
        expect(listRendererSettingsPatches()).toEqual([]);
    });
});
