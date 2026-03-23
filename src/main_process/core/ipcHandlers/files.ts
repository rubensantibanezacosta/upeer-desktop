import { ipcMain, dialog, app, shell, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
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
      // En Wayland, adjuntar a ventana padre a veces cuelga o ralentiza el portal xdg si no está bien configurado
      const isWayland = process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY;

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
            '.bmp': 'image/bmp',
            '.svg': 'image/svg+xml',
            '.txt': 'text/plain',
            '.pdf': 'application/pdf',
            '.zip': 'application/zip',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.flac': 'audio/flac',
            '.ogg': 'audio/ogg',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.mkv': 'video/x-matroska',
            '.avi': 'video/x-msvideo',
            '.mov': 'video/quicktime',
            '.wmv': 'video/x-ms-wmv',
            '.flv': 'video/x-flv',
            '.m4v': 'video/x-m4v',
            '.3gp': 'video/3gpp',
            '.ts': 'video/mp2t',
            '.mts': 'video/mp2t',
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
        '.svg': 'image/svg+xml',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska'
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
      const isWayland = process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY;
      const result = (targetWindow && !isWayland)
        ? await dialog.showSaveDialog(targetWindow, opts)
        : await dialog.showSaveDialog(opts);
      return result; // { canceled, filePath }
    } catch (error) {
      logError('Error en show-save-dialog', { err: String(error) }, 'ipc');
      return { canceled: true };
    }
  });

  // BUG FIX: Generar miniatura de video robusta usando ffmpeg en el main process
  // Evita problemas de codecs/aceleración en el renderer durante la previsualización.
  ipcMain.handle('generate-video-thumbnail', async (event, { filePath }) => {
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

      const { generateVideoThumbnail } = await import('../../utils/thumbnailGenerator.js');
      const dataUrl = await generateVideoThumbnail(resolvedPath);
      return { success: true, dataUrl };
    } catch (error) {
      logError('Error generatig video thumbnail', { err: String(error) }, 'ipc');
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  });

  ipcMain.handle('open-external', async (_event, { url }) => {
    try {
      if (typeof url !== 'string' || !url) return { success: false, error: 'URL inválida' };
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { success: false, error: 'Protocolo no permitido' };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (err: any) {
      logError('open-external failed', { err: String(err) }, 'security');
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('open-file', async (event, { filePath }) => {
    try {
      if (typeof filePath !== 'string' || !filePath) {
        return { success: false, error: 'Ruta de archivo inválida' };
      }
      const resolvedPath = path.resolve(filePath);
      const assetsDir = path.join(app.getPath('userData'), 'assets');
      const assetsDirNormalized = assetsDir.endsWith(path.sep) ? assetsDir : assetsDir + path.sep;
      const downloadsDir = app.getPath('downloads');
      const downloadsDirNormalized = downloadsDir.endsWith(path.sep) ? downloadsDir : downloadsDir + path.sep;
      const tempDir = app.getPath('temp');
      const tempDirNormalized = tempDir.endsWith(path.sep) ? tempDir : tempDir + path.sep;

      if (!resolvedPath.startsWith(assetsDirNormalized) &&
        !resolvedPath.startsWith(downloadsDirNormalized) &&
        !resolvedPath.startsWith(tempDirNormalized)) {
        return { success: false, error: 'Acceso denegado: el archivo debe estar en assets, descargas o temporal.' };
      }

      // Verificar si el archivo existe antes de intentar abrirlo
      try {
        await fs.access(resolvedPath);
      } catch (err) {
        return {
          success: false,
          error: 'El archivo ya no existe en la ruta original. Es posible que haya sido movido o eliminado.'
        };
      }

      const errorMsg = await shell.openPath(resolvedPath);
      return { success: !errorMsg, error: errorMsg || undefined };
    } catch (error) {
      logError('Error abriendo archivo', { err: String(error) }, 'ipc');
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  });

  ipcMain.handle('save-buffer-to-temp', async (event, { base64, fileName }) => {
    try {
      const tempDir = path.join(app.getPath('temp'), 'upeer-voicemail');
      const exists = fsSync.existsSync(tempDir);
      if (!exists) {
        await fs.mkdir(tempDir, { recursive: true });
      }
      const filePath = path.join(tempDir, fileName);
      const buffer = Buffer.from(base64, 'base64');
      await fs.writeFile(filePath, buffer);
      return { success: true, path: filePath };
    } catch (err) {
      logError('Error saving buffer to temp file', { fileName, err: String(err) }, 'ipc');
      return { success: false, error: String(err) };
    }
  });

  // Copia un archivo a la carpeta interna de assets para persistencia
  ipcMain.handle('persist-internal-asset', async (event, { filePath, fileName }) => {
    try {
      if (typeof filePath !== 'string' || !filePath) {
        return { success: false, error: 'Ruta de archivo inválida' };
      }

      const resolvedSource = path.resolve(filePath);
      const homeDir = app.getPath('home');
      const homeDirNormalized = homeDir.endsWith(path.sep) ? homeDir : homeDir + path.sep;
      if (!resolvedSource.startsWith(homeDirNormalized) && resolvedSource !== homeDir) {
        return { success: false, error: 'El archivo debe estar dentro del directorio home' };
      }

      const internalAssetsDir = path.join(app.getPath('userData'), 'assets');

      if (!fsSync.existsSync(internalAssetsDir)) {
        await fs.mkdir(internalAssetsDir, { recursive: true });
      }

      // Nombre único basado en hash o timestamp para evitar colisiones
      const ext = path.extname(fileName || filePath);
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
      const targetPath = path.join(internalAssetsDir, uniqueName);

      await fs.copyFile(resolvedSource, targetPath);

      return { success: true, path: targetPath };
    } catch (error) {
      logError('Error persistiendo asset interno', { err: String(error) }, 'ipc');
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  });
}