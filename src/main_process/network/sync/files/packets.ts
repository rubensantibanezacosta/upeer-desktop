export const FILE_REQ = 'SYNC_FILE_REQ';
export const FILE_RES = 'SYNC_FILE_RES';
export const FILE_CHUNK = 'SYNC_FILE_CHUNK';

export const FILE_CHUNK_SIZE = 48 * 1024;
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
const HEX_PATTERN = /^[0-9a-fA-F]+$/;

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
    if (typeof data !== 'string' || data.length === 0 || data.length > FILE_CHUNK_SIZE * 2) return null;
    if (data.length % 2 !== 0 || !HEX_PATTERN.test(data)) return null;
    return { requestId, index, data };
}

function validSize(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= FILE_MAX_BYTES;
}
