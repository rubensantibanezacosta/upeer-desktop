import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';

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

vi.mock('node:fs/promises', () => ({
    default: {
        mkdir: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockResolvedValue(['file1.jpg', 'file2.png'])
    },
    mkdir: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue(['file1.jpg', 'file2.png'])
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

        it('should return false for unsupported types', () => {
            expect(sanitizer.canSanitize('image/gif')).toBe(false);
            expect(sanitizer.canSanitize('video/mp4')).toBe(false);
            expect(sanitizer.canSanitize('application/pdf')).toBe(false);
            expect(sanitizer.canSanitize('text/plain')).toBe(false);
        });

        it('should be case insensitive', () => {
            expect(sanitizer.canSanitize('IMAGE/JPEG')).toBe(true);
            expect(sanitizer.canSanitize('Image/Png')).toBe(true);
        });
    });

    describe('sanitizeFile', () => {
        it('should return unprocessed result for unsupported types', async () => {
            const result = await sanitizer.sanitizeFile('/path/to/file.gif', 'image/gif');
            
            expect(result.wasProcessed).toBe(false);
            expect(result.sanitizedPath).toBe('/path/to/file.gif');
            expect(result.originalPath).toBe('/path/to/file.gif');
            expect(result.metadataRemoved).toEqual([]);
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
