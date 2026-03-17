import React, { useState } from 'react';
import { MediaFileMessage } from './MediaFileMessage.js';
import { DocumentFileMessage } from './DocumentFileMessage.js';

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
    isVaulting?: boolean;
}

interface FileMessageItemProps {
    data: FileMessageData;
    isMe: boolean;
    onDownload?: (fileId: string) => void;
    onOpen?: (fileId: string) => void;
    onCancel?: (fileId: string) => void;
    onRetry?: (fileId: string) => void;
    onMediaClick?: (media: { url: string; name: string; mimeType: string; fileId: string }) => void;
    status?: string;
}

export const FileMessageItem: React.FC<FileMessageItemProps> = ({
    data,
    isMe,
    onDownload,
    onOpen,
    onCancel,
    onRetry,
    onMediaClick,
    status = 'sent',
}) => {
    const {
        fileId, fileName, fileSize, mimeType, thumbnail,
        transferState = 'completed',
        direction = 'receiving',
        progress,
        savedPath, timestamp, caption, isVaulting
    } = data;

    const isTransferComplete = transferState === 'completed';
    const isTransferInProgress = transferState === 'pending' || transferState === 'active';
    const isTransferFailed = transferState === 'failed';

    // Improved safeProgress logic: default to 0 during transfer, 100 when done
    const safeProgress = progress != null && !isNaN(progress)
        ? progress
        : (isTransferComplete ? 100 : 0);

    const [isDownloading, setIsDownloading] = useState(false);
    const isImage = mimeType.startsWith('image/');
    const isVideo = mimeType.startsWith('video/');

    const handleDownload = async () => {
        if (onDownload && isTransferComplete) {
            setIsDownloading(true);
            try { await onDownload(fileId); } finally { setIsDownloading(false); }
        }
    };

    const sharedProps = {
        fileId,
        fileName, fileSize, mimeType, caption, timestamp,
        isMe, status,
        isTransferComplete, isTransferInProgress, isTransferFailed,
        savedPath, direction,
        safeProgress, transferState,
        isDownloading, isVaulting,
        onOpen: () => onOpen && isTransferComplete && savedPath && onOpen(fileId),
        onCancel: () => onCancel && (transferState === 'pending' || transferState === 'active') && onCancel(fileId),
        onRetry: () => onRetry && isTransferFailed && onRetry(fileId),
        onDownload: handleDownload,
        onMediaClick,
    };

    if (isImage || isVideo) {
        return <MediaFileMessage {...sharedProps} thumbnail={thumbnail} isImage={isImage} isVideo={isVideo} />;
    }

    return <DocumentFileMessage {...sharedProps} />;
};