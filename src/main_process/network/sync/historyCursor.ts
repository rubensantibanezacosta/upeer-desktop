export function carryHistoryCursor(
    pageCursor: string | null | undefined,
    previousCursor: string | null | undefined,
): string | null {
    if (typeof pageCursor === 'string' && pageCursor.length > 0) return pageCursor;
    if (typeof previousCursor === 'string' && previousCursor.length > 0) return previousCursor;
    return null;
}
