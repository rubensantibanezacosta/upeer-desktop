import React from 'react';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ImageIcon from '@mui/icons-material/Image';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import DescriptionIcon from '@mui/icons-material/Description';
import AttachFileIcon from '@mui/icons-material/AttachFile';

/**
 * Returns the appropriate MUI icon based on the file's MIME type and name.
 */
export const getFileIcon = (mimeType: string, fileName: string = '') => {
    const type = mimeType.toLowerCase();
    const name = fileName.toLowerCase();

    if (type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(name)) {
        return <ImageIcon />;
    }
    if (type.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm)$/.test(name)) {
        return <VideoFileIcon />;
    }
    if (type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a)$/.test(name)) {
        return <AudioFileIcon />;
    }
    if (
        type.includes('pdf') ||
        type.includes('word') ||
        type.includes('excel') ||
        type.includes('presentation') ||
        /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf)$/.test(name)
    ) {
        return <DescriptionIcon />;
    }
    if (type.includes('zip') || type.includes('rar') || type.includes('compressed') || /\.(zip|rar|7z|tar|gz)$/.test(name)) {
        return <AttachFileIcon />;
    }

    return <InsertDriveFileIcon />;
};

