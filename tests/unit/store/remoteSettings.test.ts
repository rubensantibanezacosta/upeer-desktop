import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Bridge = {
    getPendingSettingsPatches: ReturnType<typeof vi.fn>;
    ackSettingsPatch: ReturnType<typeof vi.fn>;
};

function installBridge(patches: unknown[]): Bridge {
    const bridge: Bridge = {
        getPendingSettingsPatches: vi.fn(async () => ({ patches })),
        ackSettingsPatch: vi.fn(async () => ({ ok: true })),
    };
    (window as unknown as { upeer: unknown }).upeer = bridge;
    return bridge;
}

describe('adopción de ajustes sincronizados en el renderer', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.resetModules();
    });

    afterEach(() => {
        delete (window as unknown as { upeer?: unknown }).upeer;
    });

    it('aplica una lista y la confirma', async () => {
        const bridge = installBridge([
            { block: 'lists', entity: 'lists:l1', values: { listId: 'l1', name: 'Trabajo', chatIds: ['a'] }, occurredAt: 1_000 },
        ]);
        const { drainPendingSettingsPatches } = await import('../../../src/store/remoteSettings.js');
        const { useChatListsStore } = await import('../../../src/store/useChatListsStore.js');

        await drainPendingSettingsPatches();

        expect(useChatListsStore.getState().lists).toEqual([{ id: 'l1', name: 'Trabajo', chatIds: ['a'] }]);
        expect(bridge.ackSettingsPatch).toHaveBeenCalledWith('lists:l1', 1_000);
    });

    it('aplica el destacado de un mensaje y lo confirma', async () => {
        const bridge = installBridge([
            { block: 'message', entity: 'message:m1', values: { messageId: 'm1', starred: true }, occurredAt: 2_000 },
        ]);
        const { drainPendingSettingsPatches } = await import('../../../src/store/remoteSettings.js');
        const { useChatActionsStore } = await import('../../../src/store/useChatActionsStore.js');

        await drainPendingSettingsPatches();

        expect(useChatActionsStore.getState().messagePrefs.m1?.starred).toBe(true);
        expect(bridge.ackSettingsPatch).toHaveBeenCalledWith('message:m1', 2_000);
    });

    it('aplica las banderas de un chat y las confirma', async () => {
        const bridge = installBridge([
            { block: 'chat', entity: 'chat:c1', values: { chatId: 'c1', muted: true, pinned: true }, occurredAt: 3_000 },
        ]);
        const { drainPendingSettingsPatches } = await import('../../../src/store/remoteSettings.js');
        const { useChatActionsStore } = await import('../../../src/store/useChatActionsStore.js');

        await drainPendingSettingsPatches();

        expect(useChatActionsStore.getState().contactPrefs.c1).toMatchObject({ muted: true, pinned: true });
        expect(bridge.ackSettingsPatch).toHaveBeenCalledWith('chat:c1', 3_000);
    });

    it('confirma cada entidad aunque una no traiga identificador', async () => {
        const bridge = installBridge([
            { block: 'chat', entity: '', values: {}, occurredAt: 1_000 },
            { block: 'lists', entity: 'lists:l9', values: { listId: 'l9', name: 'Nueve', chatIds: [] }, occurredAt: 2_000 },
        ]);
        const { drainPendingSettingsPatches } = await import('../../../src/store/remoteSettings.js');

        await drainPendingSettingsPatches();

        expect(bridge.ackSettingsPatch).toHaveBeenCalledTimes(1);
        expect(bridge.ackSettingsPatch).toHaveBeenCalledWith('lists:l9', 2_000);
    });

    it('sin puente no hace nada ni falla', async () => {
        delete (window as unknown as { upeer?: unknown }).upeer;
        const { drainPendingSettingsPatches } = await import('../../../src/store/remoteSettings.js');

        await expect(drainPendingSettingsPatches()).resolves.toBeUndefined();
    });

    it('si la lectura falla se queda sin aplicar y sin confirmar', async () => {
        const bridge = installBridge([]);
        bridge.getPendingSettingsPatches.mockRejectedValueOnce(new Error('sin proceso principal'));
        const { drainPendingSettingsPatches } = await import('../../../src/store/remoteSettings.js');

        await expect(drainPendingSettingsPatches()).resolves.toBeUndefined();
        expect(bridge.ackSettingsPatch).not.toHaveBeenCalled();
    });
});
