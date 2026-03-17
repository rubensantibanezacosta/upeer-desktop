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
import { MessageStatus } from '../message/MessageStatus.js';
import { getFileIcon } from '../../../utils/fileIcons.js';
import { formatFileSize } from '../../../utils/fileUtils.js';

interface DocumentFileMessageProps {
    fileName: string;
    fileSize: number;
    mimeType: string;
    caption?: string;
    timestamp?: string;
    isMe: boolean;
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
}

export const DocumentFileMessage: React.FC<DocumentFileMessageProps> = ({
    fileName,
    fileSize,
    mimeType,
    caption,
    timestamp,
    isMe,
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
}) => {
    const getFileExtension = () => {
        const parts = fileName.split('.');
        const ext = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'FILE';
        return isVaulting ? `VAULT • ${ext}` : ext;
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 240, maxWidth: 320 }}>
            <Box
                sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5,
                    borderRadius: 'md',
                    backgroundColor: isMe ? 'rgba(0,0,0,0.1)' : 'background.level1',
                    cursor: (isTransferComplete && savedPath) ? 'pointer' : 'default',
                    border: '1px solid transparent',
                }}
                onClick={(isTransferComplete && savedPath) ? onOpen : undefined}
            >
                {/* Icon with progress overlay */}
                <Box sx={{ position: 'relative', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Box sx={{
                        position: 'absolute', width: '100%', height: '100%',
                        borderRadius: '50%',
                        backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : 'primary.100',
                        color: isMe ? 'white' : 'primary.600',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        {getFileIcon(mimeType, fileName)}
                    </Box>

                    {!isTransferComplete && (
                        <Box sx={{
                            position: 'absolute', width: '100%', height: '100%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            bgcolor: 'rgba(0,0,0,0.4)', borderRadius: '50%', color: 'white',
                        }}>
                            {isTransferInProgress && (
                                <>
                                    <CircularProgress determinate={transferState === 'active'} value={safeProgress} size="sm" sx={{ '--CircularProgress-size': '44px', color: 'white' }} />
                                    <IconButton size="sm" variant="plain" sx={{ position: 'absolute', color: 'white', minHeight: 0, minWidth: 0, p: 0 }} onClick={(e) => { e.stopPropagation(); onCancel(); }}>
                                        <CloseIcon sx={{ fontSize: 18 }} />
                                    </IconButton>
                                </>
                            )}
                            {isTransferFailed && (
                                <IconButton size="sm" variant="plain" sx={{ position: 'absolute', color: 'white', minHeight: 0, minWidth: 0, p: 0 }} onClick={(e) => { e.stopPropagation(); onRetry(); }}>
                                    <RefreshIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                            )}
                        </Box>
                    )}
                </Box>

                {/* File name & size */}
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

                {/* Download action */}
                {isTransferComplete && !savedPath && direction === 'receiving' && (
                    <IconButton
                        size="sm" variant="plain" color={isMe ? 'neutral' : 'primary'}
                        sx={{ ml: 'auto', color: isMe ? 'white' : undefined }}
                        onClick={(e) => { e.stopPropagation(); onDownload(); }}
                        disabled={isDownloading}
                    >
                        {isDownloading ? <CircularProgress color="primary" size="sm" /> : <DownloadIcon />}
                    </IconButton>
                )}
            </Box>

            {caption && (
                <Box sx={{
                    px: 1.5,
                    pt: 1,
                    pb: 0.5,
                    display: 'flex',
                    flexWrap: 'wrap',
                    columnGap: 1.5,
                    rowGap: 0,
                    alignItems: 'flex-end',
                    width: '100%',
                    boxSizing: 'border-box'
                }}>
                    <Typography level="body-md" sx={{
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                        color: 'inherit',
                        flexGrow: 1,
                        pb: 0.5
                    }}>
                        {caption}
                    </Typography>
                    {timestamp && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto', mb: 0.8, opacity: 0.8 }}>
                            <Typography level="body-xs" sx={{ color: 'inherit', fontSize: '10px' }}>
                                {timestamp}
                            </Typography>
                            {isMe && <MessageStatus status={status} />}
                        </Box>
                    )}
                </Box>
            )}

            {!caption && timestamp && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5, mt: 0.5, px: 1, pb: 0.5, opacity: 0.8 }}>
                    <Typography level="body-xs" sx={{ color: 'inherit', fontSize: '10px' }}>
                        {timestamp}
                    </Typography>
                    {isMe && <MessageStatus status={status} />}
                </Box>
            )}
        </Box>
    );
};
