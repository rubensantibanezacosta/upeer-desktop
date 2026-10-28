export type StreamPrefix = {
    chunks: number;
    bytes: number;
};

export const contiguousPrefix = (
    received: ReadonlySet<number> | undefined,
    chunkSize: number,
    fileSize: number,
): StreamPrefix => {
    if (!received || received.size === 0) return { chunks: 0, bytes: 0 };
    if (!Number.isFinite(chunkSize) || chunkSize <= 0) return { chunks: 0, bytes: 0 };
    if (!Number.isFinite(fileSize) || fileSize <= 0) return { chunks: 0, bytes: 0 };

    let chunks = 0;
    while (received.has(chunks)) chunks += 1;

    const bytes = Math.min(chunks * chunkSize, fileSize);
    return { chunks, bytes };
};

export const MIN_STREAM_PREVIEW_BYTES = 512 * 1024;

export const canStreamPreview = (prefix: StreamPrefix): boolean =>
    prefix.bytes >= MIN_STREAM_PREVIEW_BYTES;

export const isStreamableMime = (mimeType?: string | null, fileName?: string | null): boolean => {
    const mime = (mimeType ?? '').toLowerCase();
    if (mime.startsWith('video/')) return true;
    const name = (fileName ?? '').toLowerCase();
    return ['.mp4', '.webm', '.mkv', '.mov', '.m4v'].some((ext) => name.endsWith(ext));
};
