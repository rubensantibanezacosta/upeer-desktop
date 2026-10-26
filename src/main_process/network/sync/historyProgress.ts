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
const servedPerPeer = new Map<string, PeerHistoryWork>();

function normalizeCount(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.trunc(value);
}

function aggregate(source: Map<string, PeerHistoryWork>): HistoryWork {
    let done = 0;
    let total = 0;
    let allKnown = true;
    for (const work of source.values()) {
        done += work.done;
        total += work.total;
        if (!work.known) allKnown = false;
    }
    return { done, total, known: source.size > 0 && allKnown && total > 0 };
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

export function resetServedHistory(deviceId: string): void {
    servedPerPeer.delete(deviceId.toLowerCase());
}

export function recordHistoryServed(deviceId: string, served: number, remaining: number): void {
    const key = deviceId.toLowerCase();
    const current = servedPerPeer.get(key) ?? { done: 0, total: 0, known: false };
    const done = current.done + normalizeCount(served);
    const left = normalizeCount(remaining);
    const total = Math.max(current.total, done + left);
    servedPerPeer.set(key, { done: Math.min(done, total), total, known: true });
}

export function forgetHistoryWork(deviceId: string): void {
    perPeer.delete(deviceId.toLowerCase());
    servedPerPeer.delete(deviceId.toLowerCase());
}

export function resetHistoryWork(): void {
    perPeer.clear();
    servedPerPeer.clear();
}

export function getHistoryWork(): HistoryWork {
    const inbound = aggregate(perPeer);
    const served = aggregate(servedPerPeer);
    if (inbound.known && served.known) {
        return { done: inbound.done + served.done, total: inbound.total + served.total, known: true };
    }
    if (inbound.known) return inbound;
    if (served.known) return served;
    const done = inbound.done + served.done;
    const total = Math.max(inbound.total + served.total, done);
    return { done, total, known: false };
}

export function parsePendingCount(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    return Math.trunc(value);
}
