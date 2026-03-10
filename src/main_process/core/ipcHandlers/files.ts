import { ipcMain, dialog, app, shell, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { error as logError } from '../../security/secure-logger.js';
import { getFocusedWindow } from '../windowManager.js';

/**
 * Registra los manejadores IPC relacionados con diálogos de archivo y operaciones de archivo
 */
export function registerFileHandlers(): void {
  // File dialog handler
  ipcMain.handle('open-file-dialog', async (event, { title, filters, defaultPath, multiSelect }) => {
    try {
      // Get the window that sent the request
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      const targetWindow = senderWindow || getFocusedWindow();

      const dialogOptions = {
        title: title || 'Seleccionar archivo',
        defaultPath: defaultPath || app.getPath('downloads'),
        filters: filters || [
          { name: 'Todos los archivos', extensions: ['*'] },
          { name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
          { name: 'Documentos', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf'] },
          { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac'] },
          { name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv'] },
        ],
        properties: multiSelect ? ['openFile', 'multiSelections'] : ['openFile']
      } as any;
      // Procedemos directamente sin delay artificial
      // En Wayland, adjuntar a ventana padre a veces cuelga el portal xdg si no está bien configurado
      const isWayland = process.env.XDG_SESSION_TYPE === 'wayland';

      const result = (targetWindow && !isWayland)
        ? await dialog.showOpenDialog(targetWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);

      if (result.canceled) {
        return { success: true, canceled: true, files: [] };
      }

      // Get file information for each selected file
      const files = await Promise.all(result.filePaths.map(async (filePath) => {
        try {
          const stats = await fs.stat(filePath);
          const ext = path.extname(filePath).toLowerCase();
          const name = path.basename(filePath);

          // Determine MIME type based on extension
          let mimeType = 'application/octet-stream';
          const mimeMap: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.txt': 'text/plain',
            '.pdf': 'application/pdf',
            '.zip': 'application/zip',
            '.mp3': 'audio/mpeg',
            '.mp4': 'video/mp4',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt': 'application/vnd.ms-powerpoint',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          };

          if (mimeMap[ext]) {
            mimeType = mimeMap[ext];
          }

          return {
            path: filePath,
            name,
            size: stats.size,
            type: mimeType,
            lastModified: stats.mtimeMs
          };
        } catch (err) {
          logError('Error getting file info', { filePath, err: String(err) }, 'ipc');
          return {
            path: filePath,
            name: path.basename(filePath),
            size: 0,
            type: 'application/octet-stream',
            lastModified: Date.now()
          };
        }
      }));

      return { success: true, canceled: false, files };
    } catch (error) {
      logError('Error opening file dialog', { err: String(error) }, 'ipc');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Read file as base64 for preview
  ipcMain.handle('read-file-as-base64', async (event, { filePath, maxSizeMB = 5 }) => {
    try {
      // BUG CX fix: sin restricción de path, un renderer comprometido puede leer
      // ~/.ssh/id_rsa, /etc/passwd u otros archivos sensibles y renderizarlos
      // (exfiltración local). Misma protección que BUG AG y BUG CW.
      if (typeof filePath !== 'string' || !filePath) {
        return { success: false, error: 'Invalid file path' };
      }
      const resolvedPath = path.resolve(filePath);
      const homeDir = app.getPath('home');
      const homeDirNormalized = homeDir.endsWith(path.sep) ? homeDir : homeDir + path.sep;
      if (!resolvedPath.startsWith(homeDirNormalized) && resolvedPath !== homeDir) {
        return { success: false, error: 'File must be within home directory' };
      }

      const stats = await fs.stat(resolvedPath);
      const maxSizeBytes = maxSizeMB * 1024 * 1024;

      if (stats.size > maxSizeBytes) {
        return { success: false, error: `File too large for preview. Max size: ${maxSizeMB}MB` };
      }

      const buffer = await fs.readFile(resolvedPath);
      const base64 = buffer.toString('base64');
      const ext = path.extname(resolvedPath).toLowerCase();

      // Determine MIME type based on extension
      let mimeType = 'application/octet-stream';
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
        '.svg': 'image/svg+xml'
      };

      if (mimeMap[ext]) {
        mimeType = mimeMap[ext];
      }

      const dataUrl = `data:${mimeType};base64,${base64}`;

      return { success: true, dataUrl, mimeType, size: stats.size };
    } catch (error) {
      logError('Error reading file as base64', { err: String(error) }, 'ipc');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // BUG EC fix: diálogo nativo de "Guardar como" para que el renderer pueda
  // pedir al usuario dónde guardar un archivo transferido.
  ipcMain.handle('show-save-dialog', async (event, { defaultPath, filters }) => {
    try {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      const targetWindow = senderWindow || getFocusedWindow();
      const opts = {
        defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
        filters: Array.isArray(filters) ? filters : [
          { name: 'Todos los archivos', extensions: ['*'] },
        ],
      } as Parameters<typeof dialog.showSaveDialog>[0];
      const result = targetWindow
        ? await dialog.showSaveDialog(targetWindow, opts)
        : await dialog.showSaveDialog(opts);
      return result; // { canceled, filePath }
    } catch (error) {
      logError('Error en show-save-dialog', { err: String(error) }, 'ipc');
      return { canceled: true };
    }
  });

  // BUG EC fix: abrir un archivo guardado con la aplicación predeterminada del
  // sistema. Incluye la misma validación de ruta que el resto de handlers de
  // archivos (solo dentro del homeDir del usuario).
  ipcMain.handle('open-file', async (event, { filePath }) => {
    try {
      if (typeof filePath !== 'string' || !filePath) {
        return { success: false, error: 'Ruta de archivo inválida' };
      }
      const resolvedPath = path.resolve(filePath);
      const homeDir = app.getPath('home');
      const homeDirNormalized = homeDir.endsWith(path.sep) ? homeDir : homeDir + path.sep;
      if (!resolvedPath.startsWith(homeDirNormalized) && resolvedPath !== homeDir) {
        return { success: false, error: 'El archivo debe estar dentro del directorio home' };
      }
      const errorMsg = await shell.openPath(resolvedPath);
      return { success: !errorMsg, error: errorMsg || undefined };
    } catch (error) {
      logError('Error abriendo archivo', { err: String(error) }, 'ipc');
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  });
}