import { usePrivacyStore } from './usePrivacyStore.js';

export type PrivacyPatch = {
    readReceipts?: boolean;
    onlineStatus?: boolean;
    lastSeen?: boolean;
};

export async function hydratePrivacyPrefs(): Promise<void> {
    const prefs = await window.upeer.getPrivacyPrefs();
    const store = usePrivacyStore.getState();
    store.setReadReceipts(prefs.readReceipts);
    store.setOnlineStatus(prefs.onlineStatus);
    store.setLastSeen(prefs.lastSeen);
}

export function pushPrivacyPrefs(patch: PrivacyPatch): void {
    window.upeer.setPrivacyPrefs(patch).catch((cause: unknown) => {
        console.warn('No se pudieron guardar las preferencias de privacidad.', cause);
    });
}
