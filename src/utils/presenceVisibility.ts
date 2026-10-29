export type PresencePreferences = {
    shareActivity: boolean;
};

export type VisiblePresence<T> = {
    isOnline: boolean;
    lastSeen: T | null;
    hidden: boolean;
};

export const PRESENCE_ONLINE_WINDOW_MS = 65_000;

export function visiblePresence<T>(
    isOnline: boolean,
    lastSeen: T | null | undefined,
    prefs: PresencePreferences,
): VisiblePresence<T> {
    if (!prefs.shareActivity) return { isOnline: false, lastSeen: null, hidden: true };
    return { isOnline, lastSeen: lastSeen ?? null, hidden: false };
}

export const isWithinPresenceWindow = (timestamp?: string | number | null, now = Date.now()): boolean => {
    if (!timestamp) return false;
    const value = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
    if (!Number.isFinite(value)) return false;
    return now - value < PRESENCE_ONLINE_WINDOW_MS;
};
