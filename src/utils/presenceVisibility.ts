export type PresencePreferences = {
    onlineStatus: boolean;
    lastSeen: boolean;
};

export type VisiblePresence<T> = {
    isOnline: boolean;
    lastSeen: T | null;
};

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
