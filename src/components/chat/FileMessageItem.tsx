import React, { useState } from 'react';
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
import { MessageStatus } from './MessageStatus.js';
import { getFileIcon } from '../../utils/fileIcons.js';

export interface FileMessageData {
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    fileHash: string;
    thumbnail?: string;
    caption?: string;
    transferState?: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
    direction?: 'sending' | 'receiving';
    progress?: number;
    tempPath?: string;
    savedPath?: string;
    timestamp?: string;
}

interface FileMessageItemProps {
    data: FileMessageData;
    isMe: boolean;
    onDownload?: (fileId: string) => void;
    onOpen?: (fileId: string) => void;
    onCancel?: (fileId: string) => void;
    onRetry?: (fileId: string) => void;
    status?: string;
}

export const FileMessageItem: React.FC<FileMessageItemProps> = ({
    data,
    isMe,
    onDownload,
    onOpen,
    onCancel,
    onRetry,
    status = 'sent'
}) => {
    const {
        fileId,
        fileName,
        fileSize,
        mimeType,
        thumbnail,
        transferState = 'completed',
        direction = 'receiving',
        progress = 100,
        savedPath,
        timestamp,
        caption
    } = data;

    const safeProgress = progress != null && !isNaN(progress) ? progress : 100;

    const [isHovered, setIsHovered] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    const formatFileSize = (bytes?: number): string => {
        const num = bytes || 0;
        if (num === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(num) / Math.log(k));
        return parseFloat((num / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const isImage = mimeType.startsWith('image/');
    const isVideo = mimeType.startsWith('video/');
    const isAudio = mimeType.startsWith('audio/');

    const getFileExtension = () => {
        const parts = fileName.split('.');
        if (parts.length > 1) {
            return parts[parts.length - 1].toUpperCase();
        }
        return 'FILE';
    };

    const handleDownload = async () => {
        if (onDownload && transferState === 'completed') {
            setIsDownloading(true);
            try {
                await onDownload(fileId);
            } finally {
                setIsDownloading(false);
            }
        }
    };

    const handleOpen = () => {
        if (onOpen && transferState === 'completed' && savedPath) {
            onOpen(fileId);
        }
    };

    const handleCancel = () => {
        if (onCancel && (transferState === 'pending' || transferState === 'active')) {
            onCancel(fileId);
        }
    };

    const handleRetry = () => {
        if (onRetry && transferState === 'failed') {
            onRetry(fileId);
        }
    };

    const isTransferInProgress = transferState === 'pending' || transferState === 'active';
    const isTransferComplete = transferState === 'completed';
    const isTransferFailed = transferState === 'failed';
    const isTransferCancelled = transferState === 'cancelled';

    // WhatsApp style Image/Video Item
    if (isImage || isVideo) {
        return (
            <Box
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                sx={{
                    position: 'relative',
                    width: 260,
                    height: isImage && !caption ? 'auto' : (isImage ? 'auto' : 260),
                    minHeight: 120,
                    borderRadius: 'md',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    cursor: (isTransferComplete && savedPath) ? 'pointer' : 'default',
                    mb: -0.5,
                    mx: -0.5,
                    mt: -0.5, // Pull to edges of message bubble
                }}
                onClick={(isTransferComplete && savedPath) ? handleOpen : undefined}
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

                {/* Overlays */}
                {!isTransferComplete && (
                    <Box sx={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 50,
                        height: 50,
                        borderRadius: '50%',
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        color: 'white'
                    }}>
                        {isTransferInProgress ? (
                            <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CircularProgress determinate={transferState === 'active'} value={safeProgress} color="primary" sx={{ '--CircularProgress-size': '44px' }} />
                                <IconButton size="sm" variant="plain" sx={{ position: 'absolute', color: 'white' }} onClick={(e) => { e.stopPropagation(); handleCancel(); }}>
                                    <CloseIcon sx={{ fontSize: 20 }} />
                                </IconButton>
                            </Box>
                        ) : isTransferFailed ? (
                            <IconButton size="sm" variant="plain" sx={{ color: 'white' }} onClick={(e) => { e.stopPropagation(); handleRetry(); }}>
                                <RefreshIcon />
                            </IconButton>
                        ) : null}
                    </Box>
                )}

                {isTransferComplete && !savedPath && direction === 'receiving' && !isHovered && (
                    <Box sx={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                    }}>
                        <IconButton
                            size="lg"
                            variant="solid"
                            color="neutral"
                            sx={{ borderRadius: '50%', boxShadow: 'md', bgcolor: 'rgba(0,0,0,0.6)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }}
                            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                            disabled={isDownloading}
                        >
                            {isDownloading ? <CircularProgress color="primary" size="sm" /> : <DownloadIcon />}
                        </IconButton>
                    </Box>
                )}

                {/* Caption below image/video */}
                {caption && (
                    <Box sx={{
                        p: 1.5,
                        width: '100%',
                        backgroundColor: isMe ? 'primary.600' : 'background.surface',
                        borderBottomLeftRadius: 'md',
                        borderBottomRightRadius: 'md',
                        color: isMe ? 'white' : 'text.primary',
                        pb: timestamp ? 3 : 1.5,
                        mt: -1, // Remove gap between image and caption
                        boxSizing: 'border-box'
                    }}>
                        <Typography level="body-sm" sx={{
                            wordBreak: 'break-word',
                            whiteSpace: 'pre-wrap',
                            color: 'inherit'
                        }}>
                            {caption}
                        </Typography>
                    </Box>
                )}

                {/* File info footer overlay on image (only if NO caption, otherwise it's below) */}
                {/* File size & type overlay (always visible on top left of the image) */}
                <Box sx={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    p: 0.5,
                    px: 1,
                    borderRadius: 'md',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(4px)',
                    color: 'white'
                }}>
                    {isVideo && <VideoFileIcon sx={{ fontSize: 14 }} />}
                    <Typography level="body-xs" sx={{ color: 'white', fontWeight: 500 }}>
                        {formatFileSize(fileSize)}
                    </Typography>
                </Box>

                {/* File timestamp overlay on image (only if NO caption) */}
                {!caption && timestamp && (
                    <Box sx={{
                        position: 'absolute',
                        bottom: 4,
                        right: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        p: 0.5,
                        px: 1,
                        borderRadius: 'md',
                        background: 'linear-gradient(to top, rgba(0,0,0,0.4), transparent)',
                        color: 'white'
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography level="body-xs" sx={{ color: 'rgba(255,255,255,0.9)', fontSize: '10px', fontWeight: 500 }}>
                                {timestamp}
                            </Typography>
                            {isMe && <MessageStatus status={status} />}
                        </Box>
                    </Box>
                )}

                {/* If there is a caption, the timestamp goes at the bottom right of the text box */}
                {caption && timestamp && (
                    <Box sx={{
                        position: 'absolute',
                        bottom: 4,
                        right: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        color: isMe ? 'rgba(255,255,255,0.7)' : 'text.tertiary'
                    }}>
                        <Typography level="body-xs" sx={{ fontSize: '10px', color: 'inherit' }}>
                            {timestamp}
                        </Typography>
                        {isMe && <MessageStatus status={status} />}
                    </Box>
                )}
            </Box>
        );
    }

    // WhatsApp style Document/File Item
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                minWidth: 240,
                maxWidth: 320,
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 'md',
                    backgroundColor: isMe ? 'rgba(0,0,0,0.1)' : 'background.level1',
                    cursor: (isTransferComplete && savedPath) ? 'pointer' : 'default',
                    border: '1px solid',
                    borderColor: isHovered && isTransferComplete && savedPath ? (isMe ? 'rgba(0,0,0,0.2)' : 'divider') : 'transparent',
                }}
                onClick={(isTransferComplete && savedPath) ? handleOpen : undefined}
            >
                {/* Icon Area */}
                <Box sx={{ position: 'relative', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Box sx={{
                        position: 'absolute',
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : 'primary.100',
                        color: isMe ? 'white' : 'primary.600',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        {getFileIcon(mimeType, fileName)}
                    </Box>

                    {/* Progress Overlay */}
                    {!isTransferComplete && (
                        <Box sx={{ position: 'absolute', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.4)', borderRadius: '50%', color: 'white' }}>
                            {isTransferInProgress ? (
                                <CircularProgress determinate={transferState === 'active'} value={safeProgress} size="sm" sx={{ '--CircularProgress-size': '44px', color: 'white' }} />
                            ) : null}
                            {isTransferInProgress ? (
                                <IconButton size="sm" variant="plain" sx={{ position: 'absolute', color: 'white', minHeight: 0, minWidth: 0, p: 0 }} onClick={(e) => { e.stopPropagation(); handleCancel(); }}>
                                    <CloseIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                            ) : isTransferFailed ? (
                                <IconButton size="sm" variant="plain" sx={{ position: 'absolute', color: 'white', minHeight: 0, minWidth: 0, p: 0 }} onClick={(e) => { e.stopPropagation(); handleRetry(); }}>
                                    <RefreshIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                            ) : null}
                        </Box>
                    )}
                </Box>

                {/* Text Area */}
                <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <Typography level="body-sm" sx={{ fontWeight: 600, color: isMe ? 'white' : 'text.primary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {fileName}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                        <Typography level="body-xs" sx={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'text.tertiary', textTransform: 'uppercase' }}>
                            {getFileExtension()}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'text.tertiary' }}>•</Typography>
                        <Typography level="body-xs" sx={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'text.tertiary' }}>
                            {formatFileSize(fileSize)}
                        </Typography>
                    </Box>
                </Box>

                {/* Action Icon */}
                {isTransferComplete && !savedPath && direction === 'receiving' && (
                    <IconButton
                        size="sm"
                        variant="plain"
                        color={isMe ? 'neutral' : 'primary'}
                        sx={{ ml: 'auto', color: isMe ? 'white' : undefined }}
                        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                        disabled={isDownloading}
                    >
                        {isDownloading ? <CircularProgress color="primary" size="sm" /> : <DownloadIcon />}
                    </IconButton>
                )}
            </Box>

            {/* Caption for Document/File */}
            {caption && (
                <Typography level="body-sm" sx={{
                    mt: 0.5,
                    px: 0.5,
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap',
                    color: isMe ? 'rgba(255,255,255,0.9)' : 'text.primary'
                }}>
                    {caption}
                </Typography>
            )}

            {/* Timestamp for documents, since it's outside the bubble usually or at bottom */}
            {timestamp && !isImage && !isVideo && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                    <Typography level="body-xs" sx={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'text.tertiary', fontSize: '10px' }}>
                        {timestamp}
                    </Typography>
                    {isMe && <MessageStatus status={status} />}
                </Box>
            )}
        </Box>
    );
};