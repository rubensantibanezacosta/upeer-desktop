export type PresencePreferences = {
    onlineStatus: boolean;
    lastSeen: boolean;
};

export type VisiblePresence<T> = {
    isOnline: boolean;
    lastSeen: T | null;
};

export const PRESENCE_ONLINE_WINDOW_MS = 65_000;

export function visiblePresence<T>(
    isOnline: boolean,
    lastSeen: T | null | undefined,
    prefs: PresencePreferences,
): VisiblePresence<T> {
    return {
        isOnline: prefs.onlineStatus && isOnline,
        lastSeen: prefs.lastSeen ? lastSeen ?? null : null,
    };
}

export const isWithinPresenceWindow = (timestamp?: string | number | null, now = Date.now()): boolean => {
    if (!timestamp) return false;
    const value = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
    if (!Number.isFinite(value)) return false;
    return now - value < PRESENCE_ONLINE_WINDOW_MS;
};
