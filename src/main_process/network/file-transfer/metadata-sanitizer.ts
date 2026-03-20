import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
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

const MIME_TO_FORMAT: Record<string, keyof sharp.FormatEnum> = {
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpeg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/tiff': 'tiff',
    'image/avif': 'avif'
};

export interface SanitizationResult {
    sanitizedPath: string;
    originalPath: string;
    wasProcessed: boolean;
    metadataRemoved: string[];
}

export class MetadataSanitizer {
    private tempDir: string;

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

    canSanitize(mimeType: string): boolean {
        return SUPPORTED_IMAGE_TYPES.has(mimeType.toLowerCase());
    }

    async sanitizeFile(filePath: string, mimeType: string): Promise<SanitizationResult> {
        const normalizedMime = mimeType.toLowerCase();
        
        if (!this.canSanitize(normalizedMime)) {
            debug('File type not supported for sanitization', { mimeType }, 'metadata-sanitizer');
            return {
                sanitizedPath: filePath,
                originalPath: filePath,
                wasProcessed: false,
                metadataRemoved: []
            };
        }

        await this.ensureTempDir();

        const fileId = crypto.randomUUID();
        const ext = path.extname(filePath) || this.getExtensionFromMime(normalizedMime);
        const sanitizedPath = path.join(this.tempDir, `${fileId}${ext}`);

        try {
            const metadataRemoved = await this.stripMetadata(filePath, sanitizedPath, normalizedMime);
            
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
            warn('Failed to sanitize file, using original', { err: String(err), filePath }, 'metadata-sanitizer');
            try {
                await fs.unlink(sanitizedPath);
            } catch (_e) { /* ignore */ }
            
            return {
                sanitizedPath: filePath,
                originalPath: filePath,
                wasProcessed: false,
                metadataRemoved: []
            };
        }
    }

    private async stripMetadata(inputPath: string, outputPath: string, mimeType: string): Promise<string[]> {
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

    private getExtensionFromMime(mimeType: string): string {
        const extensions: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'image/tiff': '.tiff',
            'image/avif': '.avif'
        };
        return extensions[mimeType] || '.jpg';
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
