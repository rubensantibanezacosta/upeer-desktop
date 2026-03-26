import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { FFMPEG_PATH, MIME_TO_FORMAT } from './metadataSanitizerSupport.js';
import { warn } from '../../security/secure-logger.js';

export async function verifySanitizedOutput(outputPath: string): Promise<boolean> {
    try {
        const stats = await fs.stat(outputPath);
        return stats.size > 0;
    } catch (err) {
        warn('Sanitized file not accessible for verification', { err: String(err) }, 'metadata-sanitizer');
        return false;
    }
}

export async function stripImageMetadata(inputPath: string, outputPath: string, mimeType: string): Promise<string[]> {
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

export async function stripMediaMetadata(inputPath: string, outputPath: string): Promise<string[]> {
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
            outputPath,
        ];

        const ffmpeg = spawn(FFMPEG_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
                return;
            }

            reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
        });

        ffmpeg.on('error', (err) => {
            reject(new Error(`FFmpeg spawn error: ${err.message}`));
        });
    });
}
