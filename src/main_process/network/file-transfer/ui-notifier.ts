import { BrowserWindow } from 'electron';
import { FileTransfer } from './types.js';

export class UINotifier {
    private lastUINotify = new Map<string, number>();

    constructor(private window: BrowserWindow | null) { }

    setWindow(window: BrowserWindow | null) {
        this.window = window;
    }

    notifyStarted(transfer: FileTransfer) {
        this.safeSend('file-transfer-started', this.mapToUI(transfer));
    }

    notifyProgress(transfer: FileTransfer, force = false) {
        const now = Date.now();
        const last = this.lastUINotify.get(transfer.fileId) || 0;
        const isDone = transfer.chunksProcessed === transfer.totalChunks;

        // Throttle updates: max ~3 per second
        if (!force && !isDone && (now - last < 300)) return;

        this.lastUINotify.set(transfer.fileId, now);
        this.safeSend('file-transfer-progress', this.mapToUI(transfer));
    }

    notifyCompleted(transfer: FileTransfer) {
        this.safeSend('file-transfer-completed', this.mapToUI(transfer));
    }

    notifyCancelled(transfer: FileTransfer, reason: string) {
        this.safeSend('file-transfer-cancelled', { ...this.mapToUI(transfer), reason });
    }

    notifyStatusUpdated(id: string, status: string) {
        this.safeSend('message-status-updated', { id, status });
    }

    notifyReceiveMessage(transfer: FileTransfer, upeerId: string) {
        const fileMessage = {
            type: 'file',
            transferId: transfer.fileId,
            fileName: transfer.fileName,
            fileSize: transfer.fileSize,
            mimeType: transfer.mimeType,
            fileHash: transfer.fileHash,
            thumbnail: transfer.thumbnail,
            caption: transfer.caption,
            direction: 'receiving'
        };

        this.safeSend('receive-p2p-message', {
            id: transfer.fileId,
            upeerId,
            isMine: false,
            message: JSON.stringify(fileMessage),
            status: 'delivered',
            timestamp: Date.now()
        });
    }

    public safeSend(channel: string, data: any) {
        if (!this.window || this.window.isDestroyed()) return;
        try {
            if (this.window.webContents && !this.window.webContents.isDestroyed()) {
                this.window.webContents.send(channel, data);
            }
        } catch (err) { /* ignore */ }
    }

    private mapToUI(transfer: FileTransfer) {
        const progress = transfer.totalChunks > 0
            ? Number(((transfer.chunksProcessed / transfer.totalChunks) * 100).toFixed(2))
            : 0;
        const bytesTransferred = Math.min(transfer.chunksProcessed * transfer.chunkSize, transfer.fileSize);

        return {
            fileId: transfer.fileId,
            upeerId: transfer.upeerId,
            fileName: transfer.fileName,
            fileSize: transfer.fileSize,
            mimeType: transfer.mimeType,
            direction: transfer.direction,
            state: transfer.state,
            phase: transfer.phase,
            chunksProcessed: transfer.chunksProcessed,
            totalChunks: transfer.totalChunks,
            thumbnail: transfer.thumbnail,
            fileHash: transfer.fileHash,
            tempPath: transfer.tempPath,
            isVaulting: !!transfer.isVaulting,
            progress,
            bytesTransferred,
            totalBytes: transfer.fileSize,
            chunksTransferred: transfer.chunksProcessed
        };
    }

    clear(fileId: string) {
        this.lastUINotify.delete(fileId);
    }
}
