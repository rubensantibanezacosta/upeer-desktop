import type { ChatSet } from './chatStoreTypes.js';

const DISABLED_SYNC_STATUS: UpeerSyncStatus = {
    state: 'disabled',
    phase: 'idle',
    devicesTotal: 0,
    devicesDone: 0,
    lastPeerAt: 0,
    ageMillis: 0,
    pendingEvents: 0,
    pendingEntityIds: [],
    peers: [],
    devices: [],
};

export const createSyncStatusActions = (set: ChatSet) => ({
    syncStatus: DISABLED_SYNC_STATUS,
    refreshSyncStatus: async () => {
        if (typeof window.upeer.getSyncStatus !== 'function') return;
        try {
            const syncStatus = await window.upeer.getSyncStatus();
            set({ syncStatus });
        } catch (error) {
            console.error('[sync] no se pudo leer el estado de sincronización', error);
        }
    },
});
