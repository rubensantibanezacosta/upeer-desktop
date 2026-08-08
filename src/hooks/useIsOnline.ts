import { useEffect, useState } from 'react';

const DEFAULT_ONLINE_WINDOW_MS = 65_000;

function lastSeenToMs(lastSeen?: string | number | Date | null): number | null {
    if (!lastSeen) return null;
    const time = lastSeen instanceof Date ? lastSeen.getTime() : new Date(lastSeen).getTime();
    return Number.isNaN(time) ? null : time;
}

export function useIsOnline(lastSeen?: string | number | Date | null, windowMs = DEFAULT_ONLINE_WINDOW_MS): boolean {
    const [isOnline, setIsOnline] = useState<boolean>(() => {
        const last = lastSeenToMs(lastSeen);
        return last !== null && Date.now() - last < windowMs;
    });

    useEffect(() => {
        const last = lastSeenToMs(lastSeen);
        if (last === null) {
            setIsOnline(false);
            return;
        }
        const elapsed = Date.now() - last;
        if (elapsed >= windowMs) {
            setIsOnline(false);
            return;
        }
        setIsOnline(true);
        const timer = setTimeout(() => setIsOnline(false), windowMs - elapsed);
        return () => clearTimeout(timer);
    }, [lastSeen, windowMs]);

    return isOnline;
}
