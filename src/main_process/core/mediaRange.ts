export type MediaRange = {
    status: 200 | 206;
    start: number;
    end: number;
    size: number;
};

const parseLimit = (fileSize: number, limit: number | null): number => {
    if (limit === null || !Number.isFinite(limit) || limit <= 0) return fileSize;
    return Math.min(fileSize, Math.floor(limit));
};

export const resolveMediaRange = (
    fileSize: number,
    range: string | null,
    limit: number | null = null,
): MediaRange | null => {
    if (!Number.isFinite(fileSize) || fileSize <= 0) return null;
    const size = parseLimit(fileSize, limit);
    if (size <= 0) return null;

    if (!range) return { status: 200, start: 0, end: size - 1, size };

    const [rawStart, rawEnd] = range.replace(/bytes=/, '').split('-');
    const start = Number.parseInt(rawStart, 10);
    if (!Number.isFinite(start) || start < 0 || start >= size) return null;
    const requestedEnd = rawEnd ? Number.parseInt(rawEnd, 10) : size - 1;
    const end = Number.isFinite(requestedEnd) ? Math.min(requestedEnd, size - 1) : size - 1;
    if (end < start) return null;

    return { status: 206, start, end, size };
};
