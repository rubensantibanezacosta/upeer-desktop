import { ipcMain, app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { error as logError } from '../../security/secure-logger.js';
import { fileTransferManager } from '../../network/file-transfer/transfer-manager.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { saveFileMessage } from '../../storage/messages/operations.js';
import { getMyUPeerId } from '../../security/identity.js';

/**
 * Registra los manejadores IPC relacionados con transferencia de archivos
 */
export function registerFileTransferHandlers(): void {
  // File transfer handlers (Phase 16)
  ipcMain.handle('start-file-transfer', async (event, { upeerId, filePath, thumbnail, caption, isVoiceNote, fileName }) => {
    try {
      // BUG CW fix: un renderer comprometido (XSS en contenido del chat) podría llamar a
      // start-file-transfer con filePath='~/.ssh/id_rsa' y el proceso principal leería y
      // transmitiría ese archivo al peer destino. Mismo patrón de protección que BUG AG
      // (save-transferred-file ya restringe el destino al homeDir).
      if (typeof filePath !== 'string' || !filePath) {
        return { success: false, error: 'Invalid file path' };
      }
      const resolvedSrc = path.resolve(filePath);
      const userDataDir = app.getPath('userData');
      const assetsDir = path.join(userDataDir, 'assets');
      const assetsDirNormalized = assetsDir.endsWith(path.sep) ? assetsDir : assetsDir + path.sep;

      if (!resolvedSrc.startsWith(assetsDirNormalized)) {
        return { success: false, error: 'Source file must be within internal assets directory. Copy it there first.' };
      }

      const { getGroupById } = await import('../../storage/groups/operations.js');
      const group = getGroupById(upeerId);

      if (group) {
        if (group.status !== 'active') return { success: false, error: 'Group is not active' };

        // Multi-send to all members with a shared logical message ID
        const myId = (await import('../../security/identity.js')).getMyUPeerId();
        const messageId = crypto.randomUUID();
        let startedTransfers = 0;
        const stats = await fs.stat(resolvedSrc);
        const effectiveFileName = fileName || path.basename(resolvedSrc);
        const mimeType = fileTransferManager.validator.detectMimeType(resolvedSrc);

        for (const memberId of group.members) {
          if (memberId === myId) continue;
          const contact = await getContactByUpeerId(memberId);
          if (contact?.publicKey) {
            await fileTransferManager.startSend(
              memberId,
              contact.address || '',
              resolvedSrc,
              thumbnail,
              caption,
              isVoiceNote,
              effectiveFileName,
              { chatUpeerId: upeerId, persistMessage: false, messageId }
            );
            startedTransfers += 1;
          }
        }

        if (startedTransfers === 0) return { success: false, error: 'No valid group recipients available' };

        await saveFileMessage(
          messageId,
          upeerId,
          true,
          effectiveFileName,
          messageId,
          stats.size,
          mimeType,
          resolvedSrc,
          undefined,
          'sent',
          getMyUPeerId(),
          undefined,
          thumbnail,
          caption,
          isVoiceNote
        );

        return { success: true, fileId: messageId };
      }

      const contact = await getContactByUpeerId(upeerId);
      if (!contact || contact.status !== 'connected') {
        return { success: false, error: 'Contact not connected' };
      }

      const fileId = await fileTransferManager.startSend(upeerId, contact.address, resolvedSrc, thumbnail, caption, isVoiceNote, fileName);
      return { success: true, fileId };
    } catch (err: unknown) {
      logError('Error starting file transfer', { err: String(err) }, 'file-transfer');
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  });

  ipcMain.handle('cancel-file-transfer', (event, { fileId, reason }) => {
    try {
      fileTransferManager.cancelTransfer(fileId, reason);
      return { success: true };
    } catch (err: unknown) {
      logError('Error canceling file transfer', { err: String(err) }, 'file-transfer');
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  });

  ipcMain.handle('retry-file-transfer', async (event, { fileId }) => {
    try {
      await fileTransferManager.retryTransfer(fileId);
      return { success: true };
    } catch (err: unknown) {
      logError('Error retrying file transfer', { err: String(err) }, 'file-transfer');
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  });

  ipcMain.handle('get-file-transfers', () => {
    try {
      const transfers = fileTransferManager.getAllTransfers().map((t) => {
        const { fileBuffer: _fileBuffer, pendingChunks, timers: _timers, _retryTimer, _chunksSentTimes, ...serializableTransfer } = t;
        return {
          ...serializableTransfer,
          fileId: t.messageId || t.fileId,
          sessionFileId: t.fileId,
          messageId: t.messageId || t.fileId,
          pendingChunks: pendingChunks ? Array.from(pendingChunks) : [],
          progress: (t.chunksProcessed / t.totalChunks) * 100
        };
      });
      return { success: true, transfers };
    } catch (err: unknown) {
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

      const transfer = fileTransferManager.getTransfer(fileId, 'receiving')
        || fileTransferManager.findTransfersByMessageId(fileId, 'receiving')[0];
      if (!transfer || !transfer.tempPath) {
        return { success: false, error: 'Transfer not found or no temporary file' };
      }

      // Move file from temp location to destination
      const fs = await import('node:fs/promises');
      await fs.copyFile(transfer.tempPath, resolvedDest);
      // Optionally delete temp file (cleanup will happen later)

      return { success: true };
    } catch (err: unknown) {
      logError('Error saving transferred file', { err: String(err) }, 'file-transfer');
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  });
}