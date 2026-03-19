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
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
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
    isVaulting?: boolean;
    onOpen: () => void;
    onCancel: () => void;
    onRetry: () => void;
    onDownload: () => void;
    onMediaClick?: (media: { url: string; name: string; mimeType: string; fileId: string }) => void;
}

export const MediaFileMessage: React.FC<MediaFileMessageProps> = ({
    fileId,
    fileName,
    fileSize,
    mimeType,
    thumbnail,
    caption,
    timestamp,
    isMe,
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
    isVaulting,
    onOpen,
    onCancel,
    onRetry,
    onDownload,
    onMediaClick,
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
                justifyContent: 'flex-start',
                alignItems: 'stretch',
                cursor: (isTransferComplete && savedPath) ? 'pointer' : 'default',
            }}
            onClick={() => {
                if (isTransferComplete && savedPath) {
                    if (onMediaClick) {
                        onMediaClick({ url: savedPath, name: fileName, mimeType, fileId });
                    } else {
                        onOpen();
                    }
                }
            }}
        >
            <Box sx={{
                position: 'relative',
                width: '100%',
                display: 'block',
                overflow: 'hidden',
                borderTopLeftRadius: isMe ? '12px' : '4px',
                borderTopRightRadius: isMe ? '4px' : '12px',
                borderBottomLeftRadius: caption ? 0 : '12px',
                borderBottomRightRadius: caption ? 0 : '12px',
            }}>
                {thumbnail ? (
                    <Box
                        component="img"
                        src={thumbnail}
                        alt={fileName}
                        sx={{
                            width: '100%',
                            display: 'block',
                            objectFit: 'cover',
                            height: 'auto',
                            maxHeight: 300,
                            filter: isTransferComplete ? 'none' : 'blur(4px)',
                            transition: 'filter 0.3s ease',
                        }}
                    />
                ) : (
                    <Box sx={{
                        p: 4,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        color: 'text.secondary',
                        backgroundColor: 'background.level2'
                    }}>
                        {isVideo ? <VideoFileIcon sx={{ fontSize: 48 }} /> : <ImageIcon sx={{ fontSize: 48 }} />}
                        <Typography level="body-xs" sx={{ mt: 1 }}>{getFileExtension()}</Typography>
                    </Box>
                )}

                {isVideo && isTransferComplete && (
                    <IconButton
                        variant="solid"
                        color="neutral"
                        sx={{
                            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                            borderRadius: 'md',
                            width: 50, height: 50,
                            '--IconButton-size': '50px',
                            backgroundColor: 'rgba(0,0,0,0.5)',
                            '&:hover': { backgroundColor: 'rgba(0,0,0,0.7)' }
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onMediaClick && savedPath) {
                                onMediaClick({ url: savedPath, name: fileName, mimeType, fileId });
                            }
                        }}
                    >
                        <PlayArrowIcon sx={{ fontSize: 32 }} />
                    </IconButton>
                )}
            </Box>

            {/* Transfer state overlay */}
            {!isTransferComplete && (
                <Box sx={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 50, height: 50, borderRadius: 'md',
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
                        sx={{ borderRadius: 'md', boxShadow: 'md', bgcolor: 'rgba(0,0,0,0.6)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }}
                        onClick={(e) => { e.stopPropagation(); onDownload(); }}
                        disabled={isDownloading}
                    >
                        {isDownloading ? <CircularProgress color="primary" size="sm" /> : <DownloadIcon />}
                    </IconButton>
                </Box>
            )}

            {/* File size badge */}
            <Box sx={{
                position: 'absolute', top: 12, left: 12,
                display: 'flex', alignItems: 'center', gap: 0.5,
                p: 0.6, px: 1.5, borderRadius: '8px',
                backgroundColor: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)', color: 'white',
                zIndex: 2,
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}>
                {isVideo && <VideoFileIcon sx={{ fontSize: 14 }} />}
                <Typography level="body-xs" sx={{ color: 'white', fontWeight: 700, fontSize: '11px' }}>
                    {formatFileSize(fileSize)}
                </Typography>
                {isVaulting && (
                    <Typography level="body-xs" sx={{ ml: 0.5, bgcolor: 'primary.500', px: 0.6, borderRadius: '4px', fontSize: '9px', fontWeight: 900, color: 'white' }}>
                        VAULT
                    </Typography>
                )}
            </Box>

            {/* Caption & Timestamp Container */}
            {caption && (
                <Box sx={{
                    px: 1.5,
                    pt: 1.2,
                    pb: 0.8,
                    width: '100%',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexWrap: 'wrap',
                    columnGap: 1.5,
                    rowGap: 0,
                    alignItems: 'flex-end'
                }}>
                    <Typography level="body-md" sx={{
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                        color: 'inherit',
                        lineHeight: 1.5,
                        flexGrow: 1,
                        pb: 0.2
                    }}>
                        {caption}
                    </Typography>
                    {timestamp && (
                        <Box sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                            ml: 'auto',
                            mb: 0.5,
                            opacity: 0.8
                        }}>
                            <Typography level="body-xs" sx={{ fontSize: '10px', color: 'inherit' }}>{timestamp}</Typography>
                            {isMe && <MessageStatus status={status} />}
                        </Box>
                    )}
                </Box>
            )}

            {/* Timestamp (no caption, over the image) */}
            {!caption && timestamp && (
                <Box sx={{
                    position: 'absolute', bottom: 10, right: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    p: 0.5, px: 1, borderRadius: '6px',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 2,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography level="body-xs" sx={{ color: 'white', fontSize: '10px', fontWeight: 600 }}>
                            {timestamp}
                        </Typography>
                        {isMe && <MessageStatus status={status} />}
                    </Box>
                </Box>
            )}
        </Box>
    );
};
