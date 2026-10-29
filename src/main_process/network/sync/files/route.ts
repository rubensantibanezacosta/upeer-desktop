import type { BrowserWindow } from 'electron';

import { warn } from '../../../security/secure-logger.js';
import { getSyncPeer } from '../../../storage/sync/peers.js';
import { getMySyncIdentity } from '../auth.js';
import { decryptPayload, type SyncPacket } from '../payloads.js';
import { FILE_CHUNK, FILE_REQ, FILE_RES, isSyncFileType, parseFileChunk, parseFileRequest, parseFileResponse } from './packets.js';
import { openSyncFileReceipt, writeSyncFileChunk } from './receiver.js';
import { completeSyncFileRequest, discardSyncFileRequest, logUnavailableRequest, notifyUnavailable } from './request.js';
import { serveSyncFile } from './responder.js';

export async function routeSyncFilePacket(
    senderDeviceId: string,
    data: SyncPacket,
    win: BrowserWindow | null,
): Promise<boolean> {
    const type = data.type;
    if (!isSyncFileType(type)) return false;
    if (data.recipientDeviceId !== getMySyncIdentity()?.deviceId) return true;
    const peer = getSyncPeer(senderDeviceId);
    if (!peer) return true;
    const payload = await decryptPayload(peer, data, type as string);
    if (!payload) return true;

    if (type === FILE_REQ) {
        const request = parseFileRequest(payload);
        if (!request) return true;
        await serveSyncFile(peer, request);
        return true;
    }
    if (type === FILE_RES) {
        const response = parseFileResponse(payload);
        if (!response) return true;
        if (!response.ok) {
            logUnavailableRequest(response.fileId);
            discardSyncFileRequest(response.fileId);
            notifyUnavailable(win, response.fileId, response.reason ?? 'unavailable');
            return true;
        }
        await openSyncFileReceipt(response);
        return true;
    }
    if (type === FILE_CHUNK) {
        const chunk = parseFileChunk(payload);
        if (!chunk) return true;
        const completedFileId = await writeSyncFileChunk(chunk, win);
        if (completedFileId) completeSyncFileRequest(completedFileId);
        return true;
    }
    warn('Paquete de fichero de sincronización sin tratamiento', { type }, 'sync');
    return true;
}
