const ACTIVE_WINDOW_MS = 5 * 60_000;

let lastLocalActive = 0;

export function markLocalActive(now = Date.now()): void {
    if (now <= lastLocalActive) return;
    lastLocalActive = now;
}

export function localActiveAt(now = Date.now()): number | undefined {
    if (lastLocalActive <= 0) return undefined;
    if (now - lastLocalActive > ACTIVE_WINDOW_MS) return undefined;
    return lastLocalActive;
}
