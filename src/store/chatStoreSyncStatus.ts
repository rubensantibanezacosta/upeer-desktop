import type { ChatSet } from './chatStoreTypes.js';

const IDLE_SYNC_STATUS: UpeerSyncStatus = {
    state: 'idle',
    phase: 'idle',
    devicesTotal: 0,
    devicesDone: 0,
    lastPeerAt: 0,
    ageMillis: 0,
    pendingEvents: 0,
    pendingMessages: 0,
    pendingMetadata: 0,
    pendingEntityIds: [],
    peers: [],
    devices: [],
    progress: {
        determinate: false,
        percent: 0,
        historyDone: 0,
        historyTotal: 0,
        historyKnown: false,
        pendingMessages: 0,
        pendingFiles: 0,
        headline: 'Sin dispositivos que sincronizar',
        detail: 'Este equipo es el único de la cuenta',
    },
};

export const createSyncStatusActions = (set: ChatSet) => ({
    syncStatus: IDLE_SYNC_STATUS,
    refreshSyncStatus: async () => {
        if (typeof window.upeer.getSyncStatus !== 'function') return;
        try {
            const syncStatus = await window.upeer.getSyncStatus();
            set({ syncStatus: syncStatus ?? IDLE_SYNC_STATUS });
        } catch (error) {
            console.error('[sync] no se pudo leer el estado de sincronización', error);
        }
    },
});
