import { getMimeType } from './fileUtils.js';

const INLINE_UNSUPPORTED_VIDEO_EXTENSIONS = new Set(['avi']);
const INLINE_UNSUPPORTED_VIDEO_MIME_TYPES = new Set(['video/x-msvideo']);

const getNormalizedMime = (mimeType?: string, fileName?: string) => {
    const mime = (mimeType && mimeType !== 'application/octet-stream') ? mimeType : (fileName ? getMimeType(fileName) : '');
    return mime.toLowerCase();
};

export const getVideoExtension = (fileName?: string) =>
    fileName?.split('.').pop()?.toLowerCase() || '';

export const isVideoFile = (mimeType?: string, fileName?: string) => {
    const mime = getNormalizedMime(mimeType, fileName);
    const ext = getVideoExtension(fileName);
    return mime.startsWith('video/') || ext === 'mkv';
};

export const supportsInlineVideoPlayback = (mimeType?: string, fileName?: string) => {
    if (!isVideoFile(mimeType, fileName)) return false;
    const mime = getNormalizedMime(mimeType, fileName);
    const ext = getVideoExtension(fileName);
    return !INLINE_UNSUPPORTED_VIDEO_MIME_TYPES.has(mime) && !INLINE_UNSUPPORTED_VIDEO_EXTENSIONS.has(ext);
};

export const getInlineVideoUnsupportedReason = (mimeType?: string, fileName?: string) => {
    if (!isVideoFile(mimeType, fileName)) return null;
    return supportsInlineVideoPlayback(mimeType, fileName)
        ? null
        : 'Este formato de vídeo no es compatible con el reproductor interno.';
};