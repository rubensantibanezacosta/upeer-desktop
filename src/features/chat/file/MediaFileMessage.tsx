import React from 'react';
import {
    Box,
    Typography,
    IconButton,
    CircularProgress,
} from '@mui/joy';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import ImageIcon from '@mui/icons-material/Image';
import { MessageStatus } from '../message/MessageStatus.js';
import { formatFileSize } from '../../../utils/fileUtils.js';

interface MediaFileMessageProps {
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    thumbnail?: string;
    caption?: string;
    timestamp?: string;
    isMe: boolean;
    isImage: boolean;
    isVideo: boolean;
    status: string;
    isTransferComplete: boolean;
    isTransferInProgress: boolean;
    isTransferFailed: boolean;
    savedPath?: string;
    direction?: string;
    safeProgress: number;
    transferState?: string;
    isDownloading: boolean;
    onOpen: () => void;
    onCancel: () => void;
    onRetry: () => void;
    onDownload: () => void;
}

export const MediaFileMessage: React.FC<MediaFileMessageProps> = ({
    fileName,
    fileSize,
    mimeType,
    thumbnail,
    caption,
    timestamp,
    isMe,
    isImage,
    isVideo,
    status,
    isTransferComplete,
    isTransferInProgress,
    isTransferFailed,
    savedPath,
    direction,
    safeProgress,
    transferState,
    isDownloading,
    onOpen,
    onCancel,
    onRetry,
    onDownload,
}) => {
    const getFileExtension = () => {
        const parts = fileName.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'FILE';
    };

    return (
        <Box
            sx={{
                position: 'relative',
                width: 260,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                cursor: (isTransferComplete && savedPath) ? 'pointer' : 'default',
            }}
            onClick={(isTransferComplete && savedPath) ? onOpen : undefined}
        >
            {thumbnail ? (
                <Box
                    component="img"
                    src={thumbnail}
                    alt={fileName}
                    sx={{
                        width: '100%',
                        display: 'block',
                        objectFit: 'cover',
                        filter: isTransferComplete ? 'none' : 'blur(4px)',
                        transition: 'filter 0.3s ease',
                    }}
                />
            ) : (
                <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'text.secondary' }}>
                    {isVideo ? <VideoFileIcon sx={{ fontSize: 48 }} /> : <ImageIcon sx={{ fontSize: 48 }} />}
                    <Typography level="body-xs" sx={{ mt: 1 }}>{getFileExtension()}</Typography>
                </Box>
            )}

            {/* Transfer state overlay */}
            {!isTransferComplete && (
                <Box sx={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 50, height: 50, borderRadius: '50%',
                    backgroundColor: 'rgba(0,0,0,0.5)', color: 'white',
                }}>
                    {isTransferInProgress ? (
                        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CircularProgress determinate={transferState === 'active'} value={safeProgress} color="primary" sx={{ '--CircularProgress-size': '44px' }} />
                            <IconButton size="sm" variant="plain" sx={{ position: 'absolute', color: 'white' }} onClick={(e) => { e.stopPropagation(); onCancel(); }}>
                                <CloseIcon sx={{ fontSize: 20 }} />
                            </IconButton>
                        </Box>
                    ) : isTransferFailed ? (
                        <IconButton size="sm" variant="plain" sx={{ color: 'white' }} onClick={(e) => { e.stopPropagation(); onRetry(); }}>
                            <RefreshIcon />
                        </IconButton>
                    ) : null}
                </Box>
            )}

            {/* Download overlay */}
            {isTransferComplete && !savedPath && direction === 'receiving' && (
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                    <IconButton
                        size="lg" variant="solid" color="neutral"
                        sx={{ borderRadius: '50%', boxShadow: 'md', bgcolor: 'rgba(0,0,0,0.6)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }}
                        onClick={(e) => { e.stopPropagation(); onDownload(); }}
                        disabled={isDownloading}
                    >
                        {isDownloading ? <CircularProgress color="primary" size="sm" /> : <DownloadIcon />}
                    </IconButton>
                </Box>
            )}

            {/* File size badge */}
            <Box sx={{
                position: 'absolute', top: 8, left: 8,
                display: 'flex', alignItems: 'center', gap: 0.5,
                p: 0.5, px: 1, borderRadius: 'md',
                backgroundColor: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(4px)', color: 'white',
            }}>
                {isVideo && <VideoFileIcon sx={{ fontSize: 14 }} />}
                <Typography level="body-xs" sx={{ color: 'white', fontWeight: 500 }}>
                    {formatFileSize(fileSize)}
                </Typography>
            </Box>

            {/* Caption */}
            {caption && (
                <Box sx={{
                    p: 1.5, width: '100%',
                    backgroundColor: isMe ? 'primary.600' : 'background.surface',
                    color: isMe ? 'white' : 'text.primary',
                    pb: timestamp ? 3 : 1.5, boxSizing: 'border-box',
                }}>
                    <Typography level="body-sm" sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', color: 'inherit' }}>
                        {caption}
                    </Typography>
                </Box>
            )}

            {/* Timestamp (with caption overlaying bottom of caption) */}
            {caption && timestamp && (
                <Box sx={{
                    position: 'absolute', bottom: 4, right: 8,
                    display: 'flex', alignItems: 'center', gap: 0.5,
                    color: isMe ? 'rgba(255,255,255,0.7)' : 'text.tertiary',
                }}>
                    <Typography level="body-xs" sx={{ fontSize: '10px', color: 'inherit' }}>{timestamp}</Typography>
                    {isMe && <MessageStatus status={status} />}
                </Box>
            )}

            {/* Timestamp (no caption, placed over the image natively) */}
            {!caption && timestamp && (
                <Box sx={{
                    position: 'absolute', bottom: 4, right: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    p: 0.5, px: 1, borderRadius: 'md',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(4px)',
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography level="body-xs" sx={{ color: 'white', fontSize: '10px' }}>
                            {timestamp}
                        </Typography>
                        {isMe && <MessageStatus status={status} />}
                    </Box>
                </Box>
            )}
        </Box>
    );
};
