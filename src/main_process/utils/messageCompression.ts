import { gzipSync, gunzipSync } from 'node:zlib';

const PREFIX = '\u2763UP\u2763';
const COMPRESS_THRESHOLD = 512;

export function compressMessage(text: string): string {
    if (text.length < COMPRESS_THRESHOLD) {
        return text;
    }
    const buf = gzipSync(Buffer.from(text, 'utf-8'));
    const wrapped = PREFIX + buf.toString('base64');
    return wrapped.length < text.length ? wrapped : text;
}

export function decompressMessage(text: string): string {
    if (!text.startsWith(PREFIX)) {
        return text;
    }
    try {
        const buf = Buffer.from(text.slice(PREFIX.length), 'base64');
        return gunzipSync(buf).toString('utf-8');
    } catch {
        return text;
    }
}

export function isCompressedMessage(text: string): boolean {
    return text.startsWith(PREFIX);
}
