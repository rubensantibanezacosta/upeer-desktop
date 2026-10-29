export type ChunkBounds = {
    start: number;
    length: number;
};

export function chunkCount(fileSize: number, chunkSize: number): number {
    if (fileSize <= 0 || chunkSize <= 0) return 0;
    return Math.ceil(fileSize / chunkSize);
}

export function chunkBounds(index: number, chunkSize: number, fileSize: number): ChunkBounds | null {
    if (index < 0 || chunkSize <= 0 || fileSize <= 0) return null;
    const start = index * chunkSize;
    if (start >= fileSize) return null;
    return { start, length: Math.min(chunkSize, fileSize - start) };
}
