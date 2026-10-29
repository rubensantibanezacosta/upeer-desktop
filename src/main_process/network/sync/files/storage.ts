import type { BrowserWindow } from 'electron';

import { findFileEntry } from '../../../storage/messages/operations.js';
import { getDb, getSchema, eq } from '../../../storage/shared.js';
import { warn } from '../../../security/secure-logger.js';

export type StoredFileEntry = {
    messageId: string;
    savedPath: string;
    fileName: string;
    fileSize: number;
};

export function findStoredFile(fileId: string): StoredFileEntry | null {
    const entry = findFileEntry(fileId);
    if (!entry || !entry.savedPath) return null;
    return {
        messageId: entry.messageId,
        savedPath: entry.savedPath,
        fileName: entry.fileName,
        fileSize: entry.fileSize,
    };
}

export function persistSavedPath(messageId: string, savedPath: string): boolean {
    try {
        const db = getDb();
        const schema = getSchema();
        const row = db.select()
            .from(schema.messages)
            .where(eq(schema.messages.id, messageId))
            .get() as { message?: string } | undefined;
        if (!row?.message) return false;
        const parsed = JSON.parse(row.message) as Record<string, unknown>;
        if (parsed.type !== 'file') return false;
        parsed.savedPath = savedPath;
        db.update(schema.messages)
            .set({ message: JSON.stringify(parsed) })
            .where(eq(schema.messages.id, messageId))
            .run();
        return true;
    } catch (err) {
        warn('No se pudo guardar la ruta del adjunto sincronizado', err, 'sync');
        return false;
    }
}

export function notifyFileReceived(win: BrowserWindow | null, messageId: string, fileId: string, savedPath: string): void {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
    win.webContents.send('sync-file-received', { messageId, fileId, savedPath });
}
