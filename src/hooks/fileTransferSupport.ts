import type { FileTransfer } from './fileTransferTypes.js';

export const aggregateTransfers = (transfersList: FileTransfer[]): FileTransfer[] => {
    const grouped = new Map<string, FileTransfer[]>();

    for (const transfer of transfersList) {
        const logicalId = transfer.messageId || transfer.fileId;
        const key = `${transfer.direction}:${logicalId}`;
        const bucket = grouped.get(key) || [];
        bucket.push(transfer);
        grouped.set(key, bucket);
    }

    return Array.from(grouped.values()).map((group) => {
        const base = group[0];
        if (group.length === 1) {
            return {
                ...base,
                fileId: base.messageId || base.fileId,
            };
        }

        const totalBytes = group.reduce((sum, item) => sum + (item.totalBytes || item.fileSize || 0), 0);
        const bytesTransferred = group.reduce((sum, item) => sum + (item.bytesTransferred || 0), 0);
        const completed = group.filter((item) => item.state === 'completed').length;
        const failed = group.some((item) => item.state === 'failed');
        const cancelled = group.some((item) => item.state === 'cancelled');
        const active = group.some((item) => item.state === 'active' || item.state === 'pending');
        const progress = totalBytes > 0 ? Math.min(100, Number(((bytesTransferred / totalBytes) * 100).toFixed(2))) : 0;

        let state: FileTransfer['state'] = 'pending';
        if (completed === group.length) {
            state = 'completed';
        } else if (active) {
            state = 'active';
        } else if (failed) {
            state = 'failed';
        } else if (cancelled) {
            state = 'cancelled';
        }

        return {
            ...base,
            fileId: base.messageId || base.fileId,
            progress,
            bytesTransferred,
            totalBytes,
            chunksTransferred: group.reduce((sum, item) => sum + (item.chunksTransferred || 0), 0),
            totalChunks: group.reduce((sum, item) => sum + (item.totalChunks || 0), 0),
            state,
            isVaulting: group.some((item) => item.isVaulting),
            lastActivity: Math.max(...group.map((item) => item.lastActivity || 0)),
        } as FileTransfer;
    });
};

export const buildTransferError = (error: unknown) => ({
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error'
});

export const formatTransferFileSize = (bytes?: number): string => {
    const num = bytes || 0;
    if (num === 0) {
        return '0 Bytes';
    }
    const base = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const index = Math.floor(Math.log(num) / Math.log(base));
    return parseFloat((num / Math.pow(base, index)).toFixed(2)) + ' ' + sizes[index];
};

export const formatTransferProgress = (transfer: FileTransfer): string => {
    if (transfer.state === 'completed') {
        return 'Completado';
    }
    if (transfer.state === 'failed') {
        return 'Falló';
    }
    if (transfer.state === 'cancelled') {
        return 'Cancelado';
    }
    return `${(transfer.progress || 0).toFixed(1)}%`;
};