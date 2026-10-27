export type PingActivity = {
    activeAtMs: number;
    lastActiveIso: string;
};

export function pingActivity(rawActiveAt: unknown, nowMs: number): PingActivity | null {
    const activeAtMs = Number(rawActiveAt);
    if (!Number.isFinite(activeAtMs) || activeAtMs <= 0) return null;
    const clamped = Math.min(activeAtMs, nowMs);
    return { activeAtMs, lastActiveIso: new Date(clamped).toISOString() };
}
