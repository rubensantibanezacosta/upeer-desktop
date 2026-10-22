import { isValidResetId } from '../security/validationShared.js';

const MAX_RESET_IDS_PER_PEER = 64;
const RESET_ID_TTL_MS = 24 * 60 * 60 * 1000;

export class DrResetReplayCache {
    private readonly entries = new Map<string, Map<string, number>>();

    constructor(private readonly now: () => number = Date.now) {}

    consume(upeerId: string, resetId: string): boolean {
        if (!isValidResetId(resetId)) return false;
        const now = this.now();
        const recent = this.entries.get(upeerId) ?? new Map<string, number>();
        for (const [id, timestamp] of recent) {
            if (now - timestamp > RESET_ID_TTL_MS) recent.delete(id);
        }
        if (recent.has(resetId)) return false;
        recent.set(resetId, now);
        while (recent.size > MAX_RESET_IDS_PER_PEER) {
            const oldest = recent.keys().next().value;
            if (oldest === undefined) break;
            recent.delete(oldest);
        }
        this.entries.set(upeerId, recent);
        return true;
    }

    clear(): void {
        this.entries.clear();
    }
}

export const drResetReplayCache = new DrResetReplayCache();
