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

    it('un aviso de bloque del renderer solo drena, no aplica el aviso en crudo', async () => {
        const bridge = installBridge([
            { block: 'lists', entity: 'lists:l2', values: { listId: 'l2', name: 'Casa', chatIds: [] }, occurredAt: 4_000 },
        ]);
        const settings = await import('../../../src/store/remoteSettings.js');
        const { useChatListsStore } = await import('../../../src/store/useChatListsStore.js');

        settings.handleSettingsUpdated({
            block: 'lists',
            entity: 'lists:l2',
            values: { listId: 'l2', name: 'Otro nombre', chatIds: [] },
            occurredAt: 4_000,
        });
        await vi.waitFor(() => {
            expect(bridge.ackSettingsPatch).toHaveBeenCalledWith('lists:l2', 4_000);
        });

        expect(useChatListsStore.getState().lists).toEqual([{ id: 'l2', name: 'Casa', chatIds: [] }]);
    });

    it('un aviso de bloque nativo se aplica en el acto sin pasar por la bandeja', async () => {
        const bridge = installBridge([]);
        const privacy = vi.fn(async () => ({ readReceipts: false, shareActivity: false }));
        (window as unknown as { upeer: Record<string, unknown> }).upeer.getPrivacyPrefs = privacy;
        const settings = await import('../../../src/store/remoteSettings.js');
        const { usePrivacyStore } = await import('../../../src/store/usePrivacyStore.js');
        usePrivacyStore.getState().setReadReceipts(true);
        usePrivacyStore.getState().setShareActivity(true);

        settings.handleSettingsUpdated({ block: 'privacy', values: {}, occurredAt: 5_000 });
        await vi.waitFor(() => {
            expect(usePrivacyStore.getState().readReceipts).toBe(false);
        });

        expect(usePrivacyStore.getState().shareActivity).toBe(false);
        expect(privacy).toHaveBeenCalledTimes(1);
        expect(bridge.getPendingSettingsPatches).not.toHaveBeenCalled();
    });

    it('clasifica como del renderer solo chat, message y lists', async () => {
        const { isRendererOwnedBlock } = await import('../../../src/store/remoteSettings.js');

        expect(isRendererOwnedBlock('chat')).toBe(true);
        expect(isRendererOwnedBlock('message')).toBe(true);
        expect(isRendererOwnedBlock('lists')).toBe(true);
        expect(isRendererOwnedBlock('privacy')).toBe(false);
        expect(isRendererOwnedBlock('retention')).toBe(false);
        expect(isRendererOwnedBlock('notification')).toBe(false);
    });
});
