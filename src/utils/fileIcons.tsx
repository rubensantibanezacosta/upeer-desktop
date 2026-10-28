import React from 'react';
import { File, Image, FileVideo, FileAudio, FileText, Paperclip, type LucideIcon } from 'lucide-react';

export const LIST_PREVIEW_ICON_SIZE = 14;

const pickFileIcon = (mimeType: string, fileName: string): LucideIcon => {
    const type = mimeType.toLowerCase();
    const name = fileName.toLowerCase();

    if (type.startsWith('image/')) {
        return Image;
    }
    if (type.startsWith('video/')) {
        return FileVideo;
    }
    if (type.startsWith('audio/')) {
        return FileAudio;
    }

    if (/\.(jpg|jpeg|png|gif|webp|svg)$/.test(name)) {
        return Image;
    }
    if (/\.(mp4|mov|avi|mkv|webm)$/.test(name)) {
        return FileVideo;
    }
    if (/\.(mp3|wav|ogg|flac|m4a)$/.test(name)) {
        return FileAudio;
    }

    if (
        type.includes('pdf') ||
        type.includes('word') ||
        type.includes('excel') ||
        type.includes('presentation') ||
        /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf)$/.test(name)
    ) {
        return FileText;
    }
    if (type.includes('zip') || type.includes('rar') || type.includes('compressed') || /\.(zip|rar|7z|tar|gz)$/.test(name)) {
        return Paperclip;
    }

    return File;
};

export const getFileIcon = (mimeType: string, fileName = '', size = 24) => {
    const Icon = pickFileIcon(mimeType, fileName);
    return <Icon style={{ fontSize: size }} />;
};
