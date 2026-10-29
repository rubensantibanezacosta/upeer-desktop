export type HistoryWork = {
    done: number;
    total: number;
    known: boolean;
};

type PeerHistoryWork = {
    done: number;
    total: number;
    known: boolean;
    updatedAt: number;
};

const WORK_TTL_MS = 120_000;

const perPeer = new Map<string, PeerHistoryWork>();
const servedPerPeer = new Map<string, PeerHistoryWork>();

function normalizeCount(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.trunc(value);
}

function entry(current: PeerHistoryWork | undefined): PeerHistoryWork {
    const now = Date.now();
    if (current && now - current.updatedAt <= WORK_TTL_MS) return current;
    return { done: 0, total: 0, known: false, updatedAt: now };
}

function aggregate(source: Map<string, PeerHistoryWork>): HistoryWork {
    const now = Date.now();
    let done = 0;
    let total = 0;
    let peers = 0;
    let allKnown = true;
    for (const work of source.values()) {
        if (now - work.updatedAt > WORK_TTL_MS) continue;
        peers += 1;
        done += work.done;
        total += work.total;
        if (!work.known) allKnown = false;
    }
    return { done, total, known: peers > 0 && allKnown && total > 0 };
}

export function recordHistoryPage(deviceId: string, applied: number, pending: number | null): void {
    const key = deviceId.toLowerCase();
    const current = entry(perPeer.get(key));
    const now = Date.now();
    const done = current.done + normalizeCount(applied);
    if (pending === null) {
        perPeer.set(key, { done, total: Math.max(current.total, done), known: current.known, updatedAt: now });
        return;
    }
    const total = Math.max(current.total, done + normalizeCount(pending));
    perPeer.set(key, { done: Math.min(done, total), total, known: true, updatedAt: now });
}

export function recordHistoryComplete(deviceId: string): void {
    const key = deviceId.toLowerCase();
    const current = entry(perPeer.get(key));
    perPeer.set(key, { done: current.total, total: current.total, known: true, updatedAt: Date.now() });
}

export function resetServedHistory(deviceId: string): void {
    servedPerPeer.delete(deviceId.toLowerCase());
}

export function recordHistoryServed(deviceId: string, served: number, remaining: number): void {
    const key = deviceId.toLowerCase();
    const current = entry(servedPerPeer.get(key));
    const now = Date.now();
    const done = current.done + normalizeCount(served);
    const total = Math.max(current.total, done + normalizeCount(remaining));
    servedPerPeer.set(key, { done: Math.min(done, total), total, known: true, updatedAt: now });
}

export function completeServedHistory(deviceId: string): void {
    const key = deviceId.toLowerCase();
    const current = entry(servedPerPeer.get(key));
    servedPerPeer.set(key, { done: current.total, total: current.total, known: true, updatedAt: Date.now() });
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

export function getInboundHistoryWork(): HistoryWork {
    return aggregate(perPeer);
}

export function parsePendingCount(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    return Math.trunc(value);
}
