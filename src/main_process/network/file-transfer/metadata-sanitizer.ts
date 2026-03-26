import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { debug, warn, error as logError } from '../../security/secure-logger.js';
import {
    canSanitizeMime,
    checkFfmpegAvailable,
    isImageMime,
    isVideoOrAudioMime,
} from './metadataSanitizerSupport.js';
import {
    stripImageMetadata,
    stripMediaMetadata,
    verifySanitizedOutput,
} from './metadataSanitizerProcessing.js';

export interface SanitizationResult {
    sanitizedPath: string;
    originalPath: string;
    wasProcessed: boolean;
    metadataRemoved: string[];
    securityWarning?: string;
}

export class MetadataSanitizer {
    private tempDir: string;
    private ffmpegAvailable: boolean | null = null;

    constructor() {
        this.tempDir = path.join(os.tmpdir(), 'chat-p2p-sanitized');
    }

    async ensureTempDir(): Promise<void> {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
        } catch (err) {
            logError('Failed to create temp dir for sanitizer', err, 'metadata-sanitizer');
            throw err;
        }
    }

    private async checkFfmpegAvailable(): Promise<boolean> {
        this.ffmpegAvailable = await checkFfmpegAvailable(this.ffmpegAvailable);
        return this.ffmpegAvailable;
    }

    canSanitize(mimeType: string): boolean {
        return canSanitizeMime(mimeType);
    }

    private isImage(mimeType: string): boolean {
        return isImageMime(mimeType);
    }

    private isVideoOrAudio(mimeType: string): boolean {
        return isVideoOrAudioMime(mimeType);
    }

    async sanitizeFile(filePath: string, mimeType: string): Promise<SanitizationResult> {
        const normalizedMime = mimeType.toLowerCase();

        if (!this.canSanitize(normalizedMime)) {
            debug('File type not supported for sanitization', { mimeType }, 'metadata-sanitizer');
            return {
                sanitizedPath: filePath,
                originalPath: filePath,
                wasProcessed: false,
                metadataRemoved: [],
                securityWarning: `Tipo de archivo ${mimeType} no soportado para limpieza de metadatos`
            };
        }

        if (this.isVideoOrAudio(normalizedMime)) {
            const ffmpegOk = await this.checkFfmpegAvailable();
            if (!ffmpegOk) {
                warn('FFmpeg not available, cannot sanitize video/audio', { mimeType }, 'metadata-sanitizer');
                return {
                    sanitizedPath: filePath,
                    originalPath: filePath,
                    wasProcessed: false,
                    metadataRemoved: [],
                    securityWarning: 'FFmpeg no disponible - el archivo puede contener metadatos de ubicación'
                };
            }
        }

        await this.ensureTempDir();

        const fileId = crypto.randomUUID();
        const ext = path.extname(filePath) || this.getExtensionFromMime(normalizedMime);
        const sanitizedPath = path.join(this.tempDir, `${fileId}${ext}`);

        try {
            let metadataRemoved: string[];

            if (this.isImage(normalizedMime)) {
                metadataRemoved = await this.stripImageMetadata(filePath, sanitizedPath, normalizedMime);
            } else if (this.isVideoOrAudio(normalizedMime)) {
                metadataRemoved = await this.stripMediaMetadata(filePath, sanitizedPath);
            } else {
                return {
                    sanitizedPath: filePath,
                    originalPath: filePath,
                    wasProcessed: false,
                    metadataRemoved: []
                };
            }

            const verified = await this.verifySanitization(sanitizedPath);
            if (!verified) {
                throw new Error('Sanitization verification failed');
            }

            debug('File metadata sanitized', {
                original: path.basename(filePath),
                metadataRemoved
            }, 'metadata-sanitizer');

            return {
                sanitizedPath,
                originalPath: filePath,
                wasProcessed: true,
                metadataRemoved
            };
        } catch (err) {
            warn('Sanitization failed, sending original file', { err: String(err), filePath }, 'metadata-sanitizer');
            try {
                await fs.unlink(sanitizedPath);
            } catch (unlinkErr) {
                warn('Failed to delete failed sanitized file', { err: String(unlinkErr) }, 'metadata-sanitizer');
            }

            return {
                sanitizedPath: filePath,
                originalPath: filePath,
                wasProcessed: false,
                metadataRemoved: [],
                securityWarning: `No se pudieron eliminar los metadatos: ${String(err)}. El archivo puede contener información de ubicación.`
            };
        }
    }

    private async verifySanitization(outputPath: string): Promise<boolean> {
        return verifySanitizedOutput(outputPath);
    }

    private async stripImageMetadata(inputPath: string, outputPath: string, mimeType: string): Promise<string[]> {
        return stripImageMetadata(inputPath, outputPath, mimeType);
    }

    private async stripMediaMetadata(inputPath: string, outputPath: string): Promise<string[]> {
        return stripMediaMetadata(inputPath, outputPath);
    }

    private getExtensionFromMime(mimeType: string): string {
        return MIME_TO_EXTENSION[mimeType.toLowerCase()] || path.extname(mimeType) || '.bin';
    }

    async cleanup(sanitizedPath: string): Promise<void> {
        if (!sanitizedPath.startsWith(this.tempDir)) return;

        try {
            await fs.unlink(sanitizedPath);
            debug('Cleaned up sanitized file', { path: sanitizedPath }, 'metadata-sanitizer');
        } catch (err) {
            warn('Failed to cleanup sanitized file', { err: String(err) }, 'metadata-sanitizer');
        }
    }

    async cleanupAll(): Promise<void> {
        try {
            const files = await fs.readdir(this.tempDir);
            for (const file of files) {
                try {
                    await fs.unlink(path.join(this.tempDir, file));
                } catch (unlinkErr) {
                    warn('Failed to delete sanitized file during cleanupAll', { file, err: String(unlinkErr) }, 'metadata-sanitizer');
                }
            }
            debug('Cleaned up all sanitized files', { count: files.length }, 'metadata-sanitizer');
        } catch (err) {
            warn('Failed to read sanitized temp dir during cleanupAll', { err: String(err) }, 'metadata-sanitizer');
        }
    }
}

export const metadataSanitizer = new MetadataSanitizer();
