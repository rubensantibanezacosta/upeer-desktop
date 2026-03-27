import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { warn } from '../security/secure-logger.js';

const isWithinDir = (filePath: string, rootDir: string) => {
    const normalizedRoot = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
    return filePath === rootDir || filePath.startsWith(normalizedRoot);
};

export function extractLocalAttachmentInfo(message: string): { fileId: string | null; filePath: string | null } | null {
    if (!message.startsWith('{') || !message.endsWith('}')) {
        return null;
    }

    try {
        const parsed = JSON.parse(message);
        if (parsed.type !== 'file') {
            return null;
        }

        const fileId = typeof parsed.transferId === 'string'
            ? parsed.transferId
            : typeof parsed.fileId === 'string'
                ? parsed.fileId
                : null;

        const filePath = [parsed.filePath, parsed.savedPath, parsed.tempPath].find(
            (value: unknown): value is string => typeof value === 'string' && value.length > 0,
        ) ?? null;

        return { fileId, filePath };
    } catch {
        return null;
    }
}

export async function cleanupLocalAttachmentFile(filePath?: string | null): Promise<void> {
    if (!filePath) {
        return;
    }

    const resolvedPath = path.resolve(filePath);
    const assetsDir = path.join(app.getPath('userData'), 'assets');
    const tempDir = app.getPath('temp');

    if (!isWithinDir(resolvedPath, assetsDir) && !isWithinDir(resolvedPath, tempDir)) {
        return;
    }

    try {
        await fs.unlink(resolvedPath);
    } catch (error: unknown) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
            warn('Failed to delete local attachment file', { filePath: resolvedPath, err: String(error) }, 'file-transfer');
        }
        return;
    }

    if (isWithinDir(resolvedPath, tempDir)) {
        try {
            await fs.rmdir(path.dirname(resolvedPath));
        } catch (error: unknown) {
            if (!(error instanceof Error) || !('code' in error) || (error.code !== 'ENOTEMPTY' && error.code !== 'ENOENT')) {
                warn('Failed to delete local attachment temp dir', { filePath: resolvedPath, err: String(error) }, 'file-transfer');
            }
        }
    }
}
