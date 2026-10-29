import { parseSyncHistoryCursor } from '../../storage/sync/messages.js';

export function carryHistoryCursor(
    pageCursor: string | null | undefined,
    previousCursor: string | null | undefined,
): string | null {
    if (typeof pageCursor === 'string' && pageCursor.length > 0) return pageCursor;
    if (typeof previousCursor === 'string' && previousCursor.length > 0) return previousCursor;
    return null;
}

export function earliestCursor(first: string | null, second: string | null): string | null {
    if (!first) return second;
    if (!second) return first;
    const a = parseSyncHistoryCursor(first);
    const b = parseSyncHistoryCursor(second);
    if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? first : second;
    return a.id <= b.id ? first : second;
}

export function retreatToLocalLatest(stored: string | null, latest: string | null): string | null {
    if (!stored) return null;
    if (!latest) return stored;
    return earliestCursor(stored, latest);
}
