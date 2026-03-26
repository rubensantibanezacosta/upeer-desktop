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
import { toMediaUrl } from '../../../utils/fileUtils.js';
import { RichText } from '../../../components/ui/RichText.js';

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
    isVaulting?: boolean;
    onOpen: () => void;
    onCancel: () => void;
    onRetry: () => void;
    onDownload: () => void;
    onMediaClick?: (media: { url: string; name: string; mimeType: string; fileId: string }) => void;
    filePath?: string;
}

export const MediaFileMessage: React.FC<MediaFileMessageProps> = ({
    fileId,
    fileName,
    fileSize: _fileSize,
    mimeType,
    thumbnail,
    caption,
    timestamp,
    isMe,
    isImage: _isImage,
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
    isVaulting: _isVaulting,
    onOpen,
    onCancel,
    onRetry,
    onDownload,
    onMediaClick,
    filePath,
}) => {
    const getFileExtension = () => {
        const parts = fileName.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'FILE';
    };

    return (
        <Box
            data-testid="media-file-message-container"
            sx={{
                position: 'relative',
                width: 260,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'stretch',
                cursor: (isTransferComplete && savedPath) || isMe ? 'pointer' : 'default',
            }}
            onClick={() => {
                const completeOrMe = isTransferComplete || isMe;
                if (completeOrMe) {
                    if (onMediaClick) {
                        const url = (isMe ? filePath : savedPath) || thumbnail || '';
                        onMediaClick({ url, name: fileName, mimeType, fileId });
                    } else if (savedPath) {
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
                {thumbnail || (isTransferComplete && savedPath) ? (
                    <Box
                        component="img"
                        src={thumbnail || toMediaUrl(savedPath!)}
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
                            if (onMediaClick) {
                                // Prefer original path for sender, savedPath for receiver
                                const url = (isMe ? filePath : savedPath) || '';
                                onMediaClick({ url, name: fileName, mimeType, fileId });
                            }
                        }}
                    >
                        <PlayArrowIcon sx={{ fontSize: 32 }} />
                    </IconButton>
                )}
            </Box>

            {/* Transfer state overlay */}
            {!isTransferComplete && (isTransferInProgress || isTransferFailed) && (
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
                    <RichText isMe={isMe} level="body-md" sx={{
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                        color: 'inherit',
                        lineHeight: 1.5,
                        flexGrow: 1,
                        pb: 0.2
                    }}>
                        {caption}
                    </RichText>
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
                    position: 'absolute', bottom: 6, right: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    p: 0.35, px: 0.75, borderRadius: '4px',
                    backgroundColor: 'rgba(0,0,0,0.42)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 2,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography level="body-xs" sx={{ color: 'white', fontSize: '10px', opacity: 0.8 }}>
                            {timestamp}
                        </Typography>
                        {isMe && <MessageStatus status={status} />}
                    </Box>
                </Box>
            )}
        </Box>
    );
};
