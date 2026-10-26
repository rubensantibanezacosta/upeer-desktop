export type HistoryWork = {
    done: number;
    total: number;
    known: boolean;
};

type PeerHistoryWork = {
    done: number;
    total: number;
    known: boolean;
};

const perPeer = new Map<string, PeerHistoryWork>();

function normalizeCount(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.trunc(value);
}

export function recordHistoryPage(deviceId: string, applied: number, pending: number | null): void {
    const key = deviceId.toLowerCase();
    const current = perPeer.get(key) ?? { done: 0, total: 0, known: false };
    const done = current.done + normalizeCount(applied);
    if (pending === null) {
        perPeer.set(key, { done, total: Math.max(current.total, done), known: current.known });
        return;
    }
    const total = Math.max(current.total, done + normalizeCount(pending));
    perPeer.set(key, { done: Math.min(done, total), total, known: true });
}

export function recordHistoryComplete(deviceId: string): void {
    const key = deviceId.toLowerCase();
    const current = perPeer.get(key) ?? { done: 0, total: 0, known: false };
    perPeer.set(key, { done: current.total, total: current.total, known: true });
}

export function forgetHistoryWork(deviceId: string): void {
    perPeer.delete(deviceId.toLowerCase());
}

export function resetHistoryWork(): void {
    perPeer.clear();
}

export function getHistoryWork(): HistoryWork {
    let done = 0;
    let total = 0;
    let allKnown = true;
    for (const work of perPeer.values()) {
        done += work.done;
        total += work.total;
        if (!work.known) allKnown = false;
    }
    const known = perPeer.size > 0 && allKnown && total > 0;
    return { done, total, known };
}

export function parsePendingCount(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    return Math.trunc(value);
}
