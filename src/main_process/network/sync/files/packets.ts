export const FILE_REQ = 'SYNC_FILE_REQ';
export const FILE_RES = 'SYNC_FILE_RES';
export const FILE_CHUNK = 'SYNC_FILE_CHUNK';

export const FILE_CHUNK_SIZE = 192 * 1024;
export const FILE_MAX_BYTES = 512 * 1024 * 1024;

export type SyncFileRequest = {
    requestId: string;
    fileId: string;
};

export type SyncFileResponse = {
    requestId: string;
    fileId: string;
    ok: boolean;
    fileName?: string;
    fileSize?: number;
    chunkSize?: number;
    totalChunks?: number;
    reason?: string;
};

export type SyncFileChunk = {
    requestId: string;
    index: number;
    data: string;
};

const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const FILE_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_ENCODED_SIZE = Math.ceil(FILE_CHUNK_SIZE / 3) * 4;

export function isSyncFileType(type: unknown): boolean {
    return type === FILE_REQ || type === FILE_RES || type === FILE_CHUNK;
}

export function parseFileRequest(value: Record<string, unknown>): SyncFileRequest | null {
    const requestId = value.requestId;
    const fileId = value.fileId;
    if (typeof requestId !== 'string' || !ID_PATTERN.test(requestId)) return null;
    if (typeof fileId !== 'string' || !FILE_ID_PATTERN.test(fileId)) return null;
    return { requestId, fileId };
}

export function parseFileResponse(value: Record<string, unknown>): SyncFileResponse | null {
    const requestId = value.requestId;
    const fileId = value.fileId;
    if (typeof requestId !== 'string' || !ID_PATTERN.test(requestId)) return null;
    if (typeof fileId !== 'string' || !FILE_ID_PATTERN.test(fileId)) return null;
    if (typeof value.ok !== 'boolean') return null;
    if (!value.ok) {
        return { requestId, fileId, ok: false, reason: typeof value.reason === 'string' ? value.reason.slice(0, 120) : 'unavailable' };
    }
    const fileName = value.fileName;
    const fileSize = value.fileSize;
    const chunkSize = value.chunkSize;
    const totalChunks = value.totalChunks;
    if (typeof fileName !== 'string' || fileName.length === 0 || fileName.length > 255) return null;
    if (!validSize(fileSize)) return null;
    if (!validSize(chunkSize) || chunkSize === 0) return null;
    if (typeof totalChunks !== 'number' || !Number.isSafeInteger(totalChunks) || totalChunks < 1) return null;
    return { requestId, fileId, ok: true, fileName, fileSize, chunkSize, totalChunks };
}

export function parseFileChunk(value: Record<string, unknown>): SyncFileChunk | null {
    const requestId = value.requestId;
    if (typeof requestId !== 'string' || !ID_PATTERN.test(requestId)) return null;
    const index = value.index;
    if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) return null;
    const data = value.data;
    if (typeof data !== 'string' || data.length === 0 || data.length > MAX_ENCODED_SIZE) return null;
    if (data.length % 4 !== 0 || !BASE64_PATTERN.test(data)) return null;
    return { requestId, index, data };
}

/** Varios tramos por frame: el móvil los agrupa para no pagar una vuelta de ratchet por tramo. */
export const FILE_CHUNK_BATCH_LIMIT = 8;
const MAX_BATCH_ENCODED = 2 * 1024 * 1024;

/**
 * Deshace un frame de fichero en tramos sueltos.
 *
 * Acepta el formato de siempre (`data`, un tramo) y el agrupado (`batch`) que manda el móvil desde el
 * 08/11. Devolver una lista en los dos casos deja al receptor igual: sigue escribiendo por índice y
 * admitiendo huecos. Sin esto, un lote del móvil llegaría al escritorio como frame sin `data` y se
 * descartaría en silencio.
 */
export function parseFileChunks(value: Record<string, unknown>): SyncFileChunk[] {
    const batch = value.batch;
    if (batch === undefined) {
        const single = parseFileChunk(value);
        return single ? [single] : [];
    }
    if (!Array.isArray(batch) || batch.length === 0 || batch.length > FILE_CHUNK_BATCH_LIMIT) return [];
    const requestId = value.requestId;
    if (typeof requestId !== 'string' || !ID_PATTERN.test(requestId)) return [];
    const chunks: SyncFileChunk[] = [];
    let encodedBytes = 0;
    for (const item of batch) {
        if (typeof item !== 'object' || item === null) return [];
        const entry = item as Record<string, unknown>;
        const index = entry.index;
        if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) return [];
        const data = entry.data;
        if (typeof data !== 'string' || data.length === 0 || data.length > MAX_ENCODED_SIZE) return [];
        if (data.length % 4 !== 0 || !BASE64_PATTERN.test(data)) return [];
        encodedBytes += data.length;
        if (encodedBytes > MAX_BATCH_ENCODED) return [];
        chunks.push({ requestId, index, data });
    }
    return chunks;
}

function validSize(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= FILE_MAX_BYTES;
}
