import type { CallMediaKind } from './mediaChunker.js';

export type CallQualityReport = {
    type: 'quality-feedback';
    target: string;
    mediaKind: CallMediaKind;
    lossRatio: number;
    jitterMs: number;
    receiveBitrate: number;
    rttMs?: number;
};

export type CallQualityLevel = {
    bitrate: number;
    framerate: number;
};

export type QualityFeedback = {
    type: 'quality-feedback';
    target: string;
    mediaKind: CallMediaKind;
    lossRatio: number;
    jitterMs: number;
    sendBitrate: number;
    rttMs?: number;
};

type ReceiveState = {
    highestSequence: number;
    missing: Set<number>;
    receivedBytes: number;
    startedAt: number;
    lastArrivalAt: number;
    lastMediaTimestamp: number;
    jitterMs: number;
    expected: number;
    lost: number;
    received: number;
};

const REPORT_INTERVAL_MS = 2000;
const REORDER_WINDOW = 8;

export class CallQualityMonitor {
    private states = new Map<string, ReceiveState>();
    private pendingProbes = new Map<string, { sentAt: number; expiresAt: number }>();
    private latestRtt = new Map<string, number>();
    private lastFeedbackAt = new Map<string, number>();

    createProbe(target: string, now = Date.now()): { type: 'quality-probe'; target: string; sentAt: number } {
        this.pendingProbes.set(target, { sentAt: now, expiresAt: now + 15_000 });
        return { type: 'quality-probe', target, sentAt: now };
    }

    resolveProbe(target: string, sentAt: number, now = Date.now()): number | null {
        const pending = this.pendingProbes.get(target);
        if (!pending || pending.sentAt !== sentAt || pending.expiresAt < now || !Number.isFinite(sentAt) || sentAt > now) return null;
        this.pendingProbes.delete(target);
        const rttMs = now - sentAt;
        this.latestRtt.set(target, rttMs);
        return rttMs;
    }

    getRtt(target: string): number | undefined {
        return this.latestRtt.get(target);
    }

    observe(peerId: string, kind: CallMediaKind, sequence: number, bytes: number, mediaTimestamp: number, now = Date.now()): CallQualityReport | null {
        const key = `${peerId}:${kind}`;
        const lastFeedbackAt = this.lastFeedbackAt.get(key);
        if (lastFeedbackAt === undefined) this.lastFeedbackAt.set(key, now);
        const state = this.states.get(key) ?? {
            highestSequence: sequence,
            missing: new Set<number>(),
            receivedBytes: 0,
            startedAt: now,
            lastArrivalAt: now,
            lastMediaTimestamp: mediaTimestamp,
            jitterMs: 0,
            expected: 1,
            lost: 0,
            received: 0,
        };
        if (sequence > state.highestSequence) {
            const gap = sequence - state.highestSequence - 1;
            state.expected += gap + 1;
            const firstMissing = Math.max(state.highestSequence + 1, sequence - REORDER_WINDOW);
            state.lost += Math.max(0, firstMissing - state.highestSequence - 1);
            for (let missingSequence = firstMissing; missingSequence < sequence; missingSequence += 1) state.missing.add(missingSequence);
            state.highestSequence = sequence;
        } else {
            const missing = state.missing.delete(sequence);
            if (!missing && sequence <= state.highestSequence) {
                this.states.set(key, state);
                return null;
            }
            if (missing) state.lost = Math.max(0, state.lost - 1);
        }
        const expiredBefore = state.highestSequence - REORDER_WINDOW;
        for (const missingSequence of state.missing) {
            if (missingSequence < expiredBefore) {
                state.missing.delete(missingSequence);
                state.lost += 1;
            }
        }
        state.receivedBytes += bytes;
        state.received += 1;
        const arrivalDelta = now - state.lastArrivalAt;
        const mediaDelta = Math.max(0, (mediaTimestamp - state.lastMediaTimestamp) / 1000);
        const transitDelta = Math.abs(arrivalDelta - mediaDelta);
        state.jitterMs += (transitDelta - state.jitterMs) / 16;
        state.lastArrivalAt = now;
        state.lastMediaTimestamp = mediaTimestamp;
        const report = lastFeedbackAt !== undefined && now - lastFeedbackAt >= REPORT_INTERVAL_MS
            ? {
                target: peerId,
                mediaKind: kind,
                lossRatio: Math.min(1, state.lost / Math.max(1, state.expected)),
                jitterMs: Math.round(state.jitterMs),
                receiveBitrate: Math.round((state.receivedBytes * 8 * 1000) / Math.max(1, now - state.startedAt)),
            }
            : null;
        if (report) {
            state.expected = 0;
            state.lost = 0;
            state.received = 0;
            state.receivedBytes = 0;
            state.startedAt = now;
            this.lastFeedbackAt.set(key, now);
        }
        this.states.set(key, state);
        return report ? { type: 'quality-feedback', ...report } : null;
    }

    reset(): void {
        this.states.clear();
        this.pendingProbes.clear();
        this.latestRtt.clear();
        this.lastFeedbackAt.clear();
    }
}

export function adaptCallQuality(current: CallQualityLevel, report: QualityFeedback): CallQualityLevel {
    if (report.mediaKind !== 'video') return current;
    if (report.lossRatio >= 0.08 || report.jitterMs >= 120 || (report.rttMs ?? 0) >= 500) {
        return {
            bitrate: Math.max(180_000, Math.round(current.bitrate * 0.75)),
            framerate: Math.max(10, current.framerate - 4),
        };
    }
    if (report.lossRatio <= 0.02 && report.jitterMs <= 35 && report.sendBitrate >= current.bitrate * 1.2 && (report.rttMs ?? 0) <= 180) {
        return {
            bitrate: Math.min(1_200_000, Math.round(current.bitrate * 1.1)),
            framerate: Math.min(30, current.framerate + 2),
        };
    }
    return current;
}