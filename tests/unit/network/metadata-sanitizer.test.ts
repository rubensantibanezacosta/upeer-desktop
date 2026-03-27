import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';

type MockFfmpegProcess = EventEmitter & {
    stderr: EventEmitter;
    stdio: ['ignore', 'pipe', 'pipe'];
};

const mockSharpInstance = {
    metadata: vi.fn().mockResolvedValue({
        exif: Buffer.from('exif-data'),
        icc: Buffer.from('icc-data'),
        iptc: Buffer.from('iptc-data'),
        xmp: Buffer.from('xmp-data')
    }),
    rotate: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    tiff: vi.fn().mockReturnThis(),
    avif: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue({ size: 1000 })
};

vi.mock('sharp', () => ({
    default: vi.fn(() => mockSharpInstance)
}));

const createMockFFmpegProcess = (exitCode = 0, emitError = false) => {
    const proc = new EventEmitter() as MockFfmpegProcess;
    proc.stderr = new EventEmitter();
    proc.stdio = ['ignore', 'pipe', 'pipe'];
    setTimeout(() => {
        if (emitError) {
            proc.emit('error', new Error('FFmpeg spawn failed'));
        } else {
            proc.stderr.emit('data', Buffer.from('Metadata: creation_time encoder location'));
            proc.emit('close', exitCode);
        }
    }, 10);
    return proc;
};

const mockSpawnBehavior = { exitCode: 0, emitError: false };

vi.mock('node:child_process', () => ({
    default: { spawn: vi.fn(() => createMockFFmpegProcess(mockSpawnBehavior.exitCode, mockSpawnBehavior.emitError)) },
    spawn: vi.fn(() => createMockFFmpegProcess(mockSpawnBehavior.exitCode, mockSpawnBehavior.emitError))
}));

vi.mock('@ffmpeg-installer/ffmpeg', () => ({
    default: { path: '/mocked/ffmpeg' }
}));

const mockStatBehavior = { shouldFail: false, size: 1000 };

vi.mock('node:fs/promises', () => ({
    default: {
        mkdir: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockResolvedValue(['file1.jpg', 'file2.png']),
        stat: vi.fn().mockImplementation(() => {
            if (mockStatBehavior.shouldFail) return Promise.reject(new Error('File not found'));
            return Promise.resolve({ size: mockStatBehavior.size });
        })
    },
    mkdir: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue(['file1.jpg', 'file2.png']),
    stat: vi.fn().mockImplementation(() => {
        if (mockStatBehavior.shouldFail) return Promise.reject(new Error('File not found'));
        return Promise.resolve({ size: mockStatBehavior.size });
    })
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
}));

import { MetadataSanitizer, metadataSanitizer } from '../../../src/main_process/network/file-transfer/metadata-sanitizer.js';

describe('MetadataSanitizer', () => {
    let sanitizer: MetadataSanitizer;

    beforeEach(() => {
        vi.clearAllMocks();
        sanitizer = new MetadataSanitizer();
        mockSpawnBehavior.exitCode = 0;
        mockSpawnBehavior.emitError = false;
        mockStatBehavior.shouldFail = false;
        mockStatBehavior.size = 1000;
        mockSharpInstance.toFile.mockResolvedValue({ size: 1000 });
    });

    describe('canSanitize', () => {
        it('should return true for supported image types', () => {
            expect(sanitizer.canSanitize('image/jpeg')).toBe(true);
            expect(sanitizer.canSanitize('image/jpg')).toBe(true);
            expect(sanitizer.canSanitize('image/png')).toBe(true);
            expect(sanitizer.canSanitize('image/webp')).toBe(true);
            expect(sanitizer.canSanitize('image/tiff')).toBe(true);
            expect(sanitizer.canSanitize('image/avif')).toBe(true);
        });

        it('should return true for supported video types', () => {
            expect(sanitizer.canSanitize('video/mp4')).toBe(true);
            expect(sanitizer.canSanitize('video/webm')).toBe(true);
            expect(sanitizer.canSanitize('video/quicktime')).toBe(true);
            expect(sanitizer.canSanitize('video/x-matroska')).toBe(true);
        });

        it('should return true for supported audio types', () => {
            expect(sanitizer.canSanitize('audio/mpeg')).toBe(true);
            expect(sanitizer.canSanitize('audio/mp3')).toBe(true);
            expect(sanitizer.canSanitize('audio/ogg')).toBe(true);
            expect(sanitizer.canSanitize('audio/wav')).toBe(true);
            expect(sanitizer.canSanitize('audio/flac')).toBe(true);
        });

        it('should return false for unsupported types', () => {
            expect(sanitizer.canSanitize('image/gif')).toBe(false);
            expect(sanitizer.canSanitize('application/pdf')).toBe(false);
            expect(sanitizer.canSanitize('text/plain')).toBe(false);
        });

        it('should be case insensitive', () => {
            expect(sanitizer.canSanitize('IMAGE/JPEG')).toBe(true);
            expect(sanitizer.canSanitize('Video/MP4')).toBe(true);
            expect(sanitizer.canSanitize('AUDIO/MPEG')).toBe(true);
        });
    });

    describe('sanitizeFile', () => {
        it('should return unprocessed result with security warning for unsupported types', async () => {
            const result = await sanitizer.sanitizeFile('/path/to/file.gif', 'image/gif');

            expect(result.wasProcessed).toBe(false);
            expect(result.sanitizedPath).toBe('/path/to/file.gif');
            expect(result.originalPath).toBe('/path/to/file.gif');
            expect(result.metadataRemoved).toEqual([]);
            expect(result.securityWarning).toBeDefined();
        });

        it('should sanitize supported image types and report removed metadata', async () => {
            const result = await sanitizer.sanitizeFile('/path/to/photo.jpg', 'image/jpeg');

            expect(result.wasProcessed).toBe(true);
            expect(result.originalPath).toBe('/path/to/photo.jpg');
            expect(result.sanitizedPath).toContain('chat-p2p-sanitized');
            expect(result.sanitizedPath).toContain('.jpg');
            expect(result.metadataRemoved).toContain('EXIF');
            expect(result.metadataRemoved).toContain('ICC');
            expect(result.metadataRemoved).toContain('IPTC');
            expect(result.metadataRemoved).toContain('XMP');
        });

        it('should use correct extension for each mime type', async () => {
            const jpegResult = await sanitizer.sanitizeFile('/path/photo.jpg', 'image/jpeg');
            expect(jpegResult.sanitizedPath).toMatch(/\.jpg$/);

            const pngResult = await sanitizer.sanitizeFile('/path/photo.png', 'image/png');
            expect(pngResult.sanitizedPath).toMatch(/\.png$/);

            const webpResult = await sanitizer.sanitizeFile('/path/photo.webp', 'image/webp');
            expect(webpResult.sanitizedPath).toMatch(/\.webp$/);
        });

        it('should sanitize video files using ffmpeg', async () => {
            const result = await sanitizer.sanitizeFile('/path/to/video.mp4', 'video/mp4');

            expect(result.wasProcessed).toBe(true);
            expect(result.originalPath).toBe('/path/to/video.mp4');
            expect(result.sanitizedPath).toContain('chat-p2p-sanitized');
            expect(result.sanitizedPath).toContain('.mp4');
        });

        it('should sanitize audio files using ffmpeg', async () => {
            const result = await sanitizer.sanitizeFile('/path/to/audio.mp3', 'audio/mpeg');

            expect(result.wasProcessed).toBe(true);
            expect(result.originalPath).toBe('/path/to/audio.mp3');
            expect(result.sanitizedPath).toContain('chat-p2p-sanitized');
            expect(result.sanitizedPath).toContain('.mp3');
        });

        it('should return securityWarning when ffmpeg is not available for video', async () => {
            mockSpawnBehavior.emitError = true;
            const freshSanitizer = new MetadataSanitizer();

            const result = await freshSanitizer.sanitizeFile('/path/to/video.mp4', 'video/mp4');

            expect(result.wasProcessed).toBe(false);
            expect(result.sanitizedPath).toBe('/path/to/video.mp4');
            expect(result.securityWarning).toContain('FFmpeg no disponible');
        });

        it('should return securityWarning when sanitization fails', async () => {
            mockSharpInstance.toFile.mockRejectedValueOnce(new Error('Sharp processing error'));

            const result = await sanitizer.sanitizeFile('/path/to/photo.jpg', 'image/jpeg');

            expect(result.wasProcessed).toBe(false);
            expect(result.sanitizedPath).toBe('/path/to/photo.jpg');
            expect(result.securityWarning).toContain('No se pudieron eliminar los metadatos');
        });

        it('should return securityWarning when verification fails (empty file)', async () => {
            mockStatBehavior.size = 0;

            const result = await sanitizer.sanitizeFile('/path/to/photo.jpg', 'image/jpeg');

            expect(result.wasProcessed).toBe(false);
            expect(result.securityWarning).toBeDefined();
        });

        it('should return securityWarning when ffmpeg exits with error code', async () => {
            mockSpawnBehavior.exitCode = 1;
            const freshSanitizer = new MetadataSanitizer();
            Reflect.set(freshSanitizer, 'ffmpegAvailable', true);

            const result = await freshSanitizer.sanitizeFile('/path/to/video.mp4', 'video/mp4');

            expect(result.wasProcessed).toBe(false);
            expect(result.securityWarning).toContain('No se pudieron eliminar los metadatos');
        });
    });

    describe('cleanup', () => {
        it('should only attempt cleanup for files in temp directory', async () => {
            const tempDir = path.join(os.tmpdir(), 'chat-p2p-sanitized');
            const testPath = path.join(tempDir, 'test-file.jpg');

            await expect(sanitizer.cleanup(testPath)).resolves.not.toThrow();
        });

        it('should not throw for files outside temp directory', async () => {
            const outsidePath = '/home/user/important-file.jpg';

            await expect(sanitizer.cleanup(outsidePath)).resolves.not.toThrow();
        });
    });

    describe('cleanupAll', () => {
        it('should not throw when cleaning up all files', async () => {
            await expect(sanitizer.cleanupAll()).resolves.not.toThrow();
        });
    });

    describe('singleton instance', () => {
        it('should export a singleton instance', () => {
            expect(metadataSanitizer).toBeInstanceOf(MetadataSanitizer);
        });
    });
});
