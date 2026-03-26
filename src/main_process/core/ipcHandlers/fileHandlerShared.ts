import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';

const TRUSTED_FILE_SELECTION_TTL_MS = 5 * 60 * 1000;
const APP_TEMP_SUBDIRS = ['upeer-voicemail'];
const trustedFileSelections = new Map<number, Map<string, number>>();

const MIME_TYPE_MAP: Record<string, string> = {
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

function normalizeDir(dirPath: string): string {
    return dirPath.endsWith(path.sep) ? dirPath : dirPath + path.sep;
}

export function isWithinDirectory(targetPath: string, dirPath: string): boolean {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedDir = path.resolve(dirPath);
    return resolvedTarget === resolvedDir || resolvedTarget.startsWith(normalizeDir(resolvedDir));
}

function cleanupTrustedSelections(senderId?: number): void {
    const now = Date.now();
    const senderIds = senderId === undefined ? Array.from(trustedFileSelections.keys()) : [senderId];

    for (const id of senderIds) {
        const entries = trustedFileSelections.get(id);
        if (!entries) continue;

        for (const [filePath, expiresAt] of entries.entries()) {
            if (expiresAt <= now) entries.delete(filePath);
        }

        if (entries.size === 0) trustedFileSelections.delete(id);
    }
}

export function registerTrustedSelection(senderId: number, filePath: string): void {
    cleanupTrustedSelections(senderId);
    const entries = trustedFileSelections.get(senderId) ?? new Map<string, number>();
    entries.set(path.resolve(filePath), Date.now() + TRUSTED_FILE_SELECTION_TTL_MS);
    trustedFileSelections.set(senderId, entries);
}

export function isTrustedSelection(senderId: number, filePath: string): boolean {
    cleanupTrustedSelections(senderId);
    return trustedFileSelections.get(senderId)?.has(path.resolve(filePath)) === true;
}

export function sanitizeOutputFileName(fileName: string, fallbackExt = ''): string {
    const baseName = path.basename(fileName || 'archivo');
    const sanitized = Array.from(baseName)
        .map((character) => {
            const codePoint = character.codePointAt(0) ?? 0;
            return codePoint < 32 || /[<>:"/\\|?*]/.test(character) ? '_' : character;
        })
        .join('')
        .trim()
        .slice(0, 120);
    const safeName = sanitized || `archivo${fallbackExt}`;
    const ext = path.extname(safeName) || fallbackExt;
    const stem = path.basename(safeName, ext).trim() || 'archivo';
    return `${stem}${ext}`;
}

export function getAppManagedTempDirs(): string[] {
    return APP_TEMP_SUBDIRS.map((dirName) => path.join(app.getPath('temp'), dirName));
}

export function isAppManagedTempFile(filePath: string): boolean {
    return getAppManagedTempDirs().some((dirPath) => isWithinDirectory(filePath, dirPath));
}

export function isPathWithinHomeDirectory(filePath: string): boolean {
    const resolvedPath = path.resolve(filePath);
    const homeDir = app.getPath('home');
    return resolvedPath === homeDir || resolvedPath.startsWith(normalizeDir(homeDir));
}

export function canOpenManagedFile(filePath: string): boolean {
    const resolvedPath = path.resolve(filePath);
    const allowedDirs = [
        path.join(app.getPath('userData'), 'assets'),
        app.getPath('downloads'),
        app.getPath('temp')
    ];

    return allowedDirs.some((dirPath) => isWithinDirectory(resolvedPath, dirPath));
}

export function resolveMimeType(filePath: string): string {
    return MIME_TYPE_MAP[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export async function copyFileToInternalAssets(
    resolvedSource: string,
    requestedFileName: string
): Promise<{ success: boolean; path?: string; error?: string }> {
    const internalAssetsDir = path.join(app.getPath('userData'), 'assets');

    if (!fsSync.existsSync(internalAssetsDir)) {
        await fs.mkdir(internalAssetsDir, { recursive: true });
    }

    const stats = await fs.stat(resolvedSource);
    if (!stats.isFile()) {
        return { success: false, error: 'La ruta origen no es un archivo válido' };
    }

    const fallbackExt = path.extname(resolvedSource);
    const safeFileName = sanitizeOutputFileName(requestedFileName || resolvedSource, fallbackExt);
    const ext = path.extname(safeFileName) || fallbackExt;
    const baseName = path.basename(safeFileName, ext).slice(0, 80) || 'asset';
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${baseName}${ext}`;
    const targetPath = path.join(internalAssetsDir, uniqueName);

    await fs.copyFile(resolvedSource, targetPath);
    return { success: true, path: targetPath };
}
