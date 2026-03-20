import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { debug, warn, error as logError } from '../../security/secure-logger.js';

const SUPPORTED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/tiff',
    'image/avif'
]);

const SUPPORTED_VIDEO_TYPES = new Set([
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/ogg',
    'video/3gpp',
    'video/3gpp2'
]);

const SUPPORTED_AUDIO_TYPES = new Set([
    'audio/mpeg',
    'audio/mp3',
    'audio/ogg',
    'audio/wav',
    'audio/x-wav',
    'audio/flac',
    'audio/aac',
    'audio/mp4',
    'audio/x-m4a',
    'audio/webm'
]);

const MIME_TO_FORMAT: Record<string, keyof sharp.FormatEnum> = {
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpeg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/tiff': 'tiff',
    'image/avif': 'avif'
};

const MIME_TO_EXTENSION: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/tiff': '.tiff',
    'image/avif': '.avif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/x-matroska': '.mkv',
    'video/ogg': '.ogv',
    'video/3gpp': '.3gp',
    'video/3gpp2': '.3g2',
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'audio/flac': '.flac',
    'audio/aac': '.aac',
    'audio/mp4': '.m4a',
    'audio/x-m4a': '.m4a',
    'audio/webm': '.weba'
};

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
        if (this.ffmpegAvailable !== null) return this.ffmpegAvailable;

        return new Promise((resolve) => {
            const proc = spawn('ffmpeg', ['-version'], { stdio: ['ignore', 'ignore', 'ignore'] });
            proc.on('close', (code) => {
                this.ffmpegAvailable = code === 0;
                resolve(this.ffmpegAvailable);
            });
            proc.on('error', () => {
                this.ffmpegAvailable = false;
                resolve(false);
            });
        });
    }

    canSanitize(mimeType: string): boolean {
        const normalized = mimeType.toLowerCase();
        return SUPPORTED_IMAGE_TYPES.has(normalized) ||
            SUPPORTED_VIDEO_TYPES.has(normalized) ||
            SUPPORTED_AUDIO_TYPES.has(normalized);
    }

    private isImage(mimeType: string): boolean {
        return SUPPORTED_IMAGE_TYPES.has(mimeType.toLowerCase());
    }

    private isVideoOrAudio(mimeType: string): boolean {
        const normalized = mimeType.toLowerCase();
        return SUPPORTED_VIDEO_TYPES.has(normalized) || SUPPORTED_AUDIO_TYPES.has(normalized);
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
            } catch (_e) { /* ignore */ }

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
        try {
            const stats = await fs.stat(outputPath);
            return stats.size > 0;
        } catch {
            return false;
        }
    }

    private async stripImageMetadata(inputPath: string, outputPath: string, mimeType: string): Promise<string[]> {
        const metadataRemoved: string[] = [];
        const format = MIME_TO_FORMAT[mimeType] || 'jpeg';

        const image = sharp(inputPath);
        const metadata = await image.metadata();

        if (metadata.exif) metadataRemoved.push('EXIF');
        if (metadata.icc) metadataRemoved.push('ICC');
        if (metadata.iptc) metadataRemoved.push('IPTC');
        if (metadata.xmp) metadataRemoved.push('XMP');

        const pipeline = image.rotate();

        switch (format) {
            case 'jpeg':
                await pipeline.jpeg({ quality: 95, mozjpeg: true }).toFile(outputPath);
                break;
            case 'png':
                await pipeline.png({ compressionLevel: 6 }).toFile(outputPath);
                break;
            case 'webp':
                await pipeline.webp({ quality: 95 }).toFile(outputPath);
                break;
            case 'tiff':
                await pipeline.tiff({ quality: 95 }).toFile(outputPath);
                break;
            case 'avif':
                await pipeline.avif({ quality: 85 }).toFile(outputPath);
                break;
            default:
                await pipeline.toFile(outputPath);
        }

        return metadataRemoved;
    }

    private async stripMediaMetadata(inputPath: string, outputPath: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const args = [
                '-i', inputPath,
                '-map_metadata', '-1',
                '-map_chapters', '-1',
                '-fflags', '+bitexact',
                '-flags:v', '+bitexact',
                '-flags:a', '+bitexact',
                '-c', 'copy',
                '-y',
                outputPath
            ];

            const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

            let stderr = '';
            ffmpeg.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    const metadataRemoved: string[] = [];
                    if (stderr.includes('Metadata')) metadataRemoved.push('Metadata');
                    if (stderr.includes('encoder')) metadataRemoved.push('Encoder');
                    if (stderr.includes('creation_time')) metadataRemoved.push('CreationTime');
                    if (stderr.includes('location')) metadataRemoved.push('GPS');
                    if (metadataRemoved.length === 0) metadataRemoved.push('AllMetadata');
                    resolve(metadataRemoved);
                } else {
                    reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
                }
            });

            ffmpeg.on('error', (err) => {
                reject(new Error(`FFmpeg spawn error: ${err.message}`));
            });
        });
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
                } catch (_e) { /* ignore */ }
            }
            debug('Cleaned up all sanitized files', { count: files.length }, 'metadata-sanitizer');
        } catch (_err) { /* ignore */ }
    }
}

export const metadataSanitizer = new MetadataSanitizer();
