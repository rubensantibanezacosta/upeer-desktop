import { app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { error as logError } from '../../security/secure-logger.js';
import { getFocusedWindow } from '../windowManager.js';
import {
    copyFileToInternalAssets,
    isAppManagedTempFile,
    isTrustedSelection,
    isWithinDirectory,
    registerTrustedSelection,
    resolveMimeType,
} from './fileHandlerShared.js';

export interface OpenFileDialogArgs {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
    multiSelect?: boolean;
}

export const buildOpenDialogOptions = ({ title, filters, defaultPath, multiSelect }: OpenFileDialogArgs) => ({
    title: title || 'Seleccionar archivo',
    defaultPath: defaultPath || app.getPath('downloads'),
    filters: filters || [
        { name: 'Todos los archivos', extensions: ['*'] },
        { name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
        { name: 'Documentos', extensions: ['pdf', 'doc', 'docx', 'txt', 'rtf'] },
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac'] },
        { name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv'] },
    ],
    properties: multiSelect ? ['openFile', 'multiSelections'] : ['openFile'],
});

export const resolveDialogTarget = (sender: Electron.WebContents) => {
    const senderWindow = BrowserWindow.fromWebContents(sender);
    const targetWindow = senderWindow || getFocusedWindow();
    const isWayland = process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY;
    return { targetWindow, isWayland };
};

export const showManagedOpenDialog = async (sender: Electron.WebContents, options: OpenFileDialogArgs) => {
    const dialogOptions = buildOpenDialogOptions(options);
    const { targetWindow, isWayland } = resolveDialogTarget(sender);
    return (targetWindow && !isWayland)
        ? dialog.showOpenDialog(targetWindow, dialogOptions)
        : dialog.showOpenDialog(dialogOptions);
};

export const showManagedSaveDialog = async (
    sender: Electron.WebContents,
    options: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }
) => {
    const { targetWindow, isWayland } = resolveDialogTarget(sender);
    const saveOptions = {
        defaultPath: typeof options.defaultPath === 'string' ? options.defaultPath : undefined,
        filters: Array.isArray(options.filters) ? options.filters : [{ name: 'Todos los archivos', extensions: ['*'] }],
    } as Parameters<typeof dialog.showSaveDialog>[0];
    return (targetWindow && !isWayland)
        ? dialog.showSaveDialog(targetWindow, saveOptions)
        : dialog.showSaveDialog(saveOptions);
};

export const mapSelectedFiles = async (senderId: number, filePaths: string[]) => {
    filePaths.forEach((filePath) => registerTrustedSelection(senderId, filePath));

    return Promise.all(filePaths.map(async (filePath) => {
        try {
            const resolvedPath = path.resolve(filePath);
            const stats = await fs.stat(resolvedPath);
            const name = path.basename(resolvedPath);
            const persisted = await copyFileToInternalAssets(resolvedPath, name);
            const effectivePath = persisted.success && persisted.path ? persisted.path : resolvedPath;

            return {
                path: effectivePath,
                name,
                size: stats.size,
                type: resolveMimeType(resolvedPath),
                lastModified: stats.mtimeMs,
            };
        } catch (err) {
            logError('Error getting file info', { filePath, err: String(err) }, 'ipc');
            return {
                path: filePath,
                name: path.basename(filePath),
                size: 0,
                type: 'application/octet-stream',
                lastModified: Date.now(),
            };
        }
    }));
};

export const persistManagedFile = async (senderId: number, filePath: string, fileName: string) => {
    const resolvedSource = path.resolve(filePath);
    const internalAssetsDir = path.join(app.getPath('userData'), 'assets');
    if (isWithinDirectory(resolvedSource, internalAssetsDir)) {
        return { success: true, path: resolvedSource };
    }

    if (!isAppManagedTempFile(resolvedSource) && !isTrustedSelection(senderId, resolvedSource)) {
        return {
            success: false,
            error: 'El archivo debe proceder de una selección explícita del usuario o de un directorio temporal interno de la app',
        };
    }

    return copyFileToInternalAssets(resolvedSource, typeof fileName === 'string' ? fileName : resolvedSource);
};