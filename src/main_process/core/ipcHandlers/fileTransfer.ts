import { ipcMain, app } from 'electron';
import path from 'node:path';
import { error as logError } from '../../security/secure-logger.js';
import { fileTransferManager } from '../../network/file-transfer/index.js';
import { getContactByUpeerId } from '../../storage/db.js';

/**
 * Registra los manejadores IPC relacionados con transferencia de archivos
 */
export function registerFileTransferHandlers(): void {
  // File transfer handlers (Phase 16)
  ipcMain.handle('start-file-transfer', async (event, { upeerId, filePath, thumbnail, caption }) => {
    try {
      // BUG CW fix: un renderer comprometido (XSS en contenido del chat) podría llamar a
      // start-file-transfer con filePath='~/.ssh/id_rsa' y el proceso principal leería y
      // transmitiría ese archivo al peer destino. Mismo patrón de protección que BUG AG
      // (save-transferred-file ya restringe el destino al homeDir).
      if (typeof filePath !== 'string' || !filePath) {
        return { success: false, error: 'Invalid file path' };
      }
      const resolvedSrc = path.resolve(filePath);
      const homeDir = app.getPath('home');
      const homeDirNormalized = homeDir.endsWith(path.sep) ? homeDir : homeDir + path.sep;
      if (!resolvedSrc.startsWith(homeDirNormalized) && resolvedSrc !== homeDir) {
        return { success: false, error: 'Source file must be within home directory' };
      }

      const { getGroupById } = await import('../../storage/db.js');
      const group = getGroupById(upeerId);

      if (group) {
        if (group.status !== 'active') return { success: false, error: 'Group is not active' };

        // Multi-send to all connected members
        const myId = (await import('../../security/identity.js')).getMyUPeerId();
        let firstFileId: string | undefined;

        for (const memberId of group.members) {
          if (memberId === myId) continue;
          const contact = await getContactByUpeerId(memberId);
          if (contact && contact.status === 'connected') {
            const fid = await fileTransferManager.startSend(memberId, contact.address, resolvedSrc, thumbnail, caption);
            if (!firstFileId) firstFileId = fid;
          }
        }

        if (!firstFileId) return { success: false, error: 'No group members are online' };
        return { success: true, fileId: firstFileId };
      }

      const contact = await getContactByUpeerId(upeerId);
      if (!contact || contact.status !== 'connected') {
        return { success: false, error: 'Contact not connected' };
      }

      const fileId = await fileTransferManager.startSend(upeerId, contact.address, resolvedSrc, thumbnail, caption);
      return { success: true, fileId };
    } catch (err: any) {
      logError('Error starting file transfer', { err: String(err) }, 'file-transfer');
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  });

  ipcMain.handle('cancel-file-transfer', (event, { fileId, reason }) => {
    try {
      fileTransferManager.cancelTransfer(fileId, reason);
      return { success: true };
    } catch (err: any) {
      logError('Error canceling file transfer', { err: String(err) }, 'file-transfer');
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  });

  ipcMain.handle('retry-file-transfer', async (event, { fileId }) => {
    try {
      await fileTransferManager.retryTransfer(fileId);
      return { success: true };
    } catch (err: any) {
      logError('Error retrying file transfer', { err: String(err) }, 'file-transfer');
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  });

  ipcMain.handle('get-file-transfers', () => {
    try {
      const transfers = fileTransferManager.getAllTransfers().map((t: any) => {
        const { fileBuffer: _fileBuffer, pendingChunks, timers: _timers, _retryTimer, _chunksSentTimes, ...serializableTransfer } = t;
        return {
          ...serializableTransfer,
          pendingChunks: pendingChunks ? Array.from(pendingChunks) : [],
          progress: (t.chunksProcessed / t.totalChunks) * 100
        };
      });
      return { success: true, transfers };
    } catch (err: any) {
      logError('Error getting file transfers', { err: String(err) }, 'file-transfer');
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('save-transferred-file', async (event, { fileId, destinationPath }) => {
    try {
      // BUG AG fix: validar destinationPath antes de copiar.
      // Sin esto, un renderer comprometido (XSS, inyección de contenido) podría
      // escribir en rutas arbitrarias como ~/.ssh/authorized_keys o ~/.bashrc.
      if (typeof destinationPath !== 'string' || !destinationPath) {
        return { success: false, error: 'Invalid destination path' };
      }
      const resolvedDest = path.resolve(destinationPath);
      const homeDir = app.getPath('home');
      // Permitir solo destinos dentro del directorio home del usuario.
      // path.sep al final evita que homeDir sea prefijo de otro directorio
      // con el mismo nombre más texto (ej: /home/user vs /home/username).
      const homeDirNormalized = homeDir.endsWith(path.sep) ? homeDir : homeDir + path.sep;
      if (!resolvedDest.startsWith(homeDirNormalized) && resolvedDest !== homeDir) {
        return { success: false, error: 'Destination must be within home directory' };
      }

      const transfer = fileTransferManager.getTransfer(fileId, 'receiving');
      if (!transfer || !transfer.tempPath) {
        return { success: false, error: 'Transfer not found or no temporary file' };
      }

      // Move file from temp location to destination
      const fs = await import('node:fs/promises');
      await fs.copyFile(transfer.tempPath, resolvedDest);
      // Optionally delete temp file (cleanup will happen later)

      return { success: true };
    } catch (err: any) {
      logError('Error saving transferred file', { err: String(err) }, 'file-transfer');
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  });
}