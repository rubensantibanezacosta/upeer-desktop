import { useNotificationStore } from './useNotificationStore.js';

export type NotificationPatch = {
    messages?: boolean;
    requests?: boolean;
    sound?: boolean;
};

export async function hydrateNotificationPrefs(): Promise<void> {
    const prefs = await window.upeer.getNotificationPrefs();
    const store = useNotificationStore.getState();
    store.setMsgNotif(prefs.messages);
    store.setReqNotif(prefs.requests);
    store.setSound(prefs.sound);
}

export function pushNotificationPrefs(patch: NotificationPatch): void {
    window.upeer.setNotificationPrefs(patch).catch((cause: unknown) => {
        console.warn('No se pudieron guardar las preferencias de notificación.', cause);
    });
}
