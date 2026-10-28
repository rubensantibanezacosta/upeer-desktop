import fs from 'node:fs';
import { debug, warn } from '../../security/secure-logger.js';
import { findFileEntry, type FileHistoryEntry } from '../../storage/messages/operations.js';
import { getGroupById } from '../../storage/groups/operations.js';
import type { TransferManager } from './transfer-manager.js';

const RESEND_COOLDOWN_MS = 60_000;
const recentRequests = new Map<string, number>();

export type FileRequestPayload = {
    fileId: string;
    messageId?: string;
    chatUpeerId?: string;
};

function isAuthorized(entry: FileHistoryEntry, upeerId: string): boolean {
    if (entry.chatUpeerId === upeerId) return true;
    if (!entry.chatUpeerId.startsWith('grp-')) return false;
    const group = getGroupById(entry.chatUpeerId);
    return Boolean(group && group.status === 'active' && group.members.includes(upeerId));
}

function claimRequest(upeerId: string, fileId: string): boolean {
    const key = `${upeerId}:${fileId}`;
    const now = Date.now();
    const previous = recentRequests.get(key);
    if (previous && now - previous < RESEND_COOLDOWN_MS) return false;
    for (const [entryKey, at] of recentRequests) {
        if (now - at >= RESEND_COOLDOWN_MS) recentRequests.delete(entryKey);
    }
    recentRequests.set(key, now);
    return true;
}

export async function resendRequestedFile(
    this: TransferManager,
    upeerId: string,
    address: string,
    request: FileRequestPayload
): Promise<void> {
    const entry = findFileEntry(request.fileId);
    if (!entry) {
        debug('FILE_REQUEST sin fichero local', { fileId: request.fileId, upeerId }, 'file-transfer');
        return;
    }
    if (!isAuthorized(entry, upeerId)) {
        warn('FILE_REQUEST no autorizado', { fileId: request.fileId, upeerId, chat: entry.chatUpeerId }, 'file-transfer');
        return;
    }
    if (!entry.savedPath || !fs.existsSync(entry.savedPath)) {
        warn('FILE_REQUEST sin ruta válida', { fileId: entry.fileId, upeerId, savedPath: entry.savedPath }, 'file-transfer');
        return;
    }
    if (!claimRequest(upeerId, entry.fileId)) {
        debug('FILE_REQUEST repetido, ignorado', { fileId: entry.fileId, upeerId }, 'file-transfer');
        return;
    }

    const messageId = request.messageId ?? entry.messageId;
    await this.startSend(
        upeerId,
        address,
        entry.savedPath,
        entry.thumbnail,
        entry.caption,
        entry.isVoiceNote,
        entry.fileName,
        { chatUpeerId: entry.chatUpeerId, persistMessage: false, messageId }
    );
}
