export const formatFileSize = (bytes?: number): string => {
    const num = bytes || 0;
    if (num === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return parseFloat((num / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const getMimeType = (fileName: string): string => {
    const parts = fileName.split('.');
    if (parts.length <= 1) return 'application/octet-stream';
    const ext = parts.pop()?.toLowerCase();

    const mimeMap: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'bmp': 'image/bmp',
        'svg': 'image/svg+xml',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'ogg': 'video/ogg',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'mkv': 'video/x-matroska',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'flac': 'audio/flac',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt': 'text/plain',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed',
    };

    return mimeMap[ext || ''] || 'application/octet-stream';
};

export const resolveFileMimeType = (mimeType?: string, fileName?: string): string => {
    const normalized = mimeType?.toLowerCase() || '';
    if (normalized && normalized !== 'application/octet-stream') return normalized;
    return fileName ? getMimeType(fileName).toLowerCase() : 'application/octet-stream';
};

export const isImageFile = (mimeType?: string, fileName?: string): boolean =>
    resolveFileMimeType(mimeType, fileName).startsWith('image/');

export const isPdfFile = (mimeType?: string, fileName?: string): boolean =>
    resolveFileMimeType(mimeType, fileName).includes('pdf');

export const isPreviewableFile = (mimeType?: string, fileName?: string): boolean =>
    isImageFile(mimeType, fileName)
    || resolveFileMimeType(mimeType, fileName).startsWith('video/')
    || fileName?.toLowerCase().endsWith('.mkv')
    || isPdfFile(mimeType, fileName);

export const toMediaUrl = (filePath: string): string => {
    const raw = filePath.startsWith('media://') ? filePath.slice(8) : filePath;
    const normalized = raw.replace(/\\/g, '/');
    const driveMatch = normalized.match(/^([A-Za-z]):?\/(.+)$/);
    if (driveMatch) {
        return `media://${driveMatch[1]}/${driveMatch[2]}`;
    }
    return `media://${normalized.startsWith('/') ? '' : '/'}${normalized}`;
};

export const fromMediaUrl = (mediaUrl: string): string => {
    if (!mediaUrl.startsWith('media://')) return mediaUrl;
    const url = new URL(mediaUrl);
    const hostname = url.hostname;
    const pathname = decodeURIComponent(url.pathname);
    if (/^[a-zA-Z]$/.test(hostname)) {
        return hostname + ':' + pathname;
    }
    const combined = hostname + pathname;
    return combined.startsWith('/') ? combined : '/' + combined;
};
