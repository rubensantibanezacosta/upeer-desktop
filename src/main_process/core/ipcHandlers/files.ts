import { ipcMain, app, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { error as logError } from '../../security/secure-logger.js';
import {
  canOpenManagedFile,
  isPathWithinHomeDirectory,
  isWithinDirectory,
  registerTrustedSelection,
  resolveMimeType,
  sanitizeOutputFileName,
} from './fileHandlerShared.js';
import { mapSelectedFiles, persistManagedFile, showManagedOpenDialog, showManagedSaveDialog } from './fileHandlerIpcSupport.js';

export function registerFileHandlers(): void {
  ipcMain.handle('register-trusted-selected-file', async (event, { filePath }) => {
    try {
      if (typeof filePath !== 'string' || !filePath) {
        return { success: false, error: 'Ruta de archivo inválida' };
      }

      const resolvedPath = path.resolve(filePath);
      const stats = await fs.stat(resolvedPath);
      if (!stats.isFile()) {
        return { success: false, error: 'La ruta origen no es un archivo válido' };
      }

      registerTrustedSelection(event.sender.id, resolvedPath);
      return { success: true };
    } catch (error) {
      logError('Error registrando archivo seleccionado de confianza', { err: String(error) }, 'ipc');
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  });

  // File dialog handler
  ipcMain.handle('open-file-dialog', async (event, { title, filters, defaultPath, multiSelect }) => {
    try {
      const result = await showManagedOpenDialog(event.sender, { title, filters, defaultPath, multiSelect });

      if (result.canceled) {
        return { success: true, canceled: true, files: [] };
      }

      const files = await mapSelectedFiles(event.sender.id, result.filePaths);

      return { success: true, canceled: false, files };
    } catch (error) {
      logError('Error opening file dialog', { err: String(error) }, 'ipc');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('read-file-as-base64', async (event, { filePath, maxSizeMB = 5 }) => {
    try {
      if (typeof filePath !== 'string' || !filePath) {
        return { success: false, error: 'Invalid file path' };
      }
      const resolvedPath = path.resolve(filePath);
      if (!isPathWithinHomeDirectory(resolvedPath)) {
        return { success: false, error: 'File must be within home directory' };
      }

      const stats = await fs.stat(resolvedPath);
      const maxSizeBytes = maxSizeMB * 1024 * 1024;

      if (stats.size > maxSizeBytes) {
        return { success: false, error: `File too large for preview. Max size: ${maxSizeMB}MB` };
      }

      const buffer = await fs.readFile(resolvedPath);
      const base64 = buffer.toString('base64');
      const mimeType = resolveMimeType(resolvedPath);

      const dataUrl = `data:${mimeType};base64,${base64}`;

      return { success: true, dataUrl, mimeType, size: stats.size };
    } catch (error) {
      logError('Error reading file as base64', { err: String(error) }, 'ipc');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('show-save-dialog', async (event, { defaultPath, filters }) => {
    try {
      return await showManagedSaveDialog(event.sender, { defaultPath, filters });
    } catch (error) {
      logError('Error en show-save-dialog', { err: String(error) }, 'ipc');
      return { canceled: true };
    }
  });

  ipcMain.handle('generate-video-thumbnail', async (event, { filePath }) => {
    try {
      if (typeof filePath !== 'string' || !filePath) {
        return { success: false, error: 'Ruta de archivo inválida' };
      }
      const resolvedPath = path.resolve(filePath);
      if (!isPathWithinHomeDirectory(resolvedPath)) {
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
    } catch (err: unknown) {
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
      if (!canOpenManagedFile(resolvedPath)) {
        return { success: false, error: 'Acceso denegado: el archivo debe estar en assets, descargas o temporal.' };
      }

      try {
        await fs.access(resolvedPath);
      } catch {
        return {
          success: false,
          error: 'El archivo ya no existe en la ruta original. Es posible que haya sido movido o eliminado.',
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
      await fs.mkdir(tempDir, { recursive: true });
      const safeFileName = sanitizeOutputFileName(typeof fileName === 'string' ? fileName : 'archivo');
      const filePath = path.join(tempDir, safeFileName);
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
      const internalAssetsDir = path.join(app.getPath('userData'), 'assets');
      const isAlreadyInternalAsset = isWithinDirectory(resolvedSource, internalAssetsDir);

      if (isAlreadyInternalAsset) {
        return { success: true, path: resolvedSource };
      }

      return await persistManagedFile(event.sender.id, resolvedSource, typeof fileName === 'string' ? fileName : resolvedSource);
    } catch (error) {
      logError('Error persistiendo asset interno', { err: String(error) }, 'ipc');
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  });

  ipcMain.handle('persist-selected-file', async (event, { filePath, fileName }) => {
    try {
      if (typeof filePath !== 'string' || !filePath) {
        return { success: false, error: 'Ruta de archivo inválida' };
      }
      return await persistManagedFile(event.sender.id, filePath, typeof fileName === 'string' ? fileName : filePath);
    } catch (error) {
      logError('Error persistiendo archivo seleccionado', { err: String(error) }, 'ipc');
      return { success: false, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  });
}