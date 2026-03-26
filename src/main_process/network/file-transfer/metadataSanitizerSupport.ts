import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { debug, warn } from '../../security/secure-logger.js';

export const FFMPEG_PATH = ffmpegInstaller.path;

const SUPPORTED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/tiff',
    'image/avif',
]);

const SUPPORTED_VIDEO_TYPES = new Set([
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/ogg',
    'video/3gpp',
    'video/3gpp2',
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
    'audio/webm',
]);

export const MIME_TO_FORMAT: Record<string, keyof sharp.FormatEnum> = {
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpeg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/tiff': 'tiff',
    'image/avif': 'avif',
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
    'audio/webm': '.weba',
};

export function canSanitizeMime(mimeType: string): boolean {
    const normalized = mimeType.toLowerCase();
    return SUPPORTED_IMAGE_TYPES.has(normalized)
        || SUPPORTED_VIDEO_TYPES.has(normalized)
        || SUPPORTED_AUDIO_TYPES.has(normalized);
}

export function isImageMime(mimeType: string): boolean {
    return SUPPORTED_IMAGE_TYPES.has(mimeType.toLowerCase());
}

export function isVideoOrAudioMime(mimeType: string): boolean {
    const normalized = mimeType.toLowerCase();
    return SUPPORTED_VIDEO_TYPES.has(normalized) || SUPPORTED_AUDIO_TYPES.has(normalized);
}

export function getExtensionFromMime(mimeType: string): string {
    return MIME_TO_EXTENSION[mimeType.toLowerCase()] || path.extname(mimeType) || '.bin';
}

export async function checkFfmpegAvailable(cachedValue: boolean | null): Promise<boolean> {
    if (cachedValue !== null) {
        return cachedValue;
    }

    return new Promise((resolve) => {
        const proc = spawn(FFMPEG_PATH, ['-version'], { stdio: ['ignore', 'ignore', 'ignore'] });
        proc.on('close', (code) => {
            const available = code === 0;
            if (available) {
                debug('FFmpeg available (bundled)', { path: FFMPEG_PATH }, 'metadata-sanitizer');
            }
            resolve(available);
        });
        proc.on('error', () => {
            warn('FFmpeg not available', { path: FFMPEG_PATH }, 'metadata-sanitizer');
            resolve(false);
        });
    });
}
