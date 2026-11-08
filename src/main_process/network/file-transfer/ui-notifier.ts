import { BrowserWindow } from 'electron';
import { FileTransfer } from './types.js';
import { warn, debug } from '../../security/secure-logger.js';
import { getMessageById } from '../../storage/messages/operations.js';

/**
 * Hora con la que se debe mostrar un adjunto recibido.
 *
 * `Date.now()` es la hora de recepción, que solo coincide con la del mensaje cuando
 * el adjunto llega en directo. Un adjunto vaulteado llega tarde (al reconectar o al
 * arrancar el dispositivo), así que usar la hora de recepción pisaba la hora real de
 * envío. El `messageId` del adjunto es el mismo que el del mensaje sincronizado, así
 * que si ese mensaje ya está en la base de datos se hereda su hora.
 */
function receivedAttachmentTimestamp(messageId: string): number {
    try {
        const stored = getMessageById(messageId) as { timestamp?: number | string } | undefined;
        const parsed = typeof stored?.timestamp === 'string' ? Number(stored.timestamp) : stored?.timestamp;
        if (typeof parsed === 'number' && Number.isFinite(parsed)) return parsed;
    } catch (err) {
        // Sin base de datos disponible (arranque, o un entorno sin storage) el adjunto
        // se sigue mostrando: perder la hora original es peor que no mostrar el adjunto,
        // pero fallar aquí tumbaría la recepción entera.
        warn('No se pudo leer la hora del mensaje del adjunto', { messageId, err: String(err) }, 'file-transfer');
    }
    return Date.now();
}

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

    notifyFailed(transfer: FileTransfer, reason: string) {
        const messageId = transfer.messageId || transfer.fileId;
        this.safeSend('file-transfer-failed', { ...this.mapToUI(transfer), fileId: messageId, messageId, reason });
        if (transfer.direction === 'sending') {
            void this.persistFailed(messageId);
        }
    }

    private async persistFailed(messageId: string) {
        const { updateTransferMessageStatus } = await import('./db-helper.js');
        const { getMessageStatus } = await import('../../storage/messages/status.js');
        const persisted = await updateTransferMessageStatus(messageId, 'failed');
        if (persisted || getMessageStatus(messageId) === null) {
            this.notifyStatusUpdated(messageId, 'failed');
        }
    }

    notifyStatusUpdated(id: string, status: string) {
        this.safeSend('message-status-updated', { id, status });
    }

    notifyReceiveMessage(transfer: FileTransfer, upeerId: string) {
        const messageId = transfer.messageId || transfer.fileId;
        const timestamp = receivedAttachmentTimestamp(messageId);
        const fileMessage = {
            type: 'file',
            transferId: transfer.fileId,
            fileName: transfer.fileName,
            fileSize: transfer.fileSize,
            mimeType: transfer.mimeType,
            fileHash: transfer.fileHash,
            thumbnail: transfer.thumbnail,
            caption: transfer.caption,
            isVoiceNote: transfer.isVoiceNote,
            direction: 'receiving',
            // Incluir el estado y la ruta para que la UI refleje el proceso de descarga
            // (spinner/progreso) aunque el transfer todavía no se haya cargado en el store
            // de React al insertar el mensaje.
            state: transfer.state,
            ...(transfer.tempPath ? { tempPath: transfer.tempPath } : {}),
        };

        if (transfer.chatUpeerId?.startsWith('grp-')) {
            this.safeSend('receive-group-message', {
                id: messageId,
                groupId: transfer.chatUpeerId,
                senderUpeerId: upeerId,
                isMine: false,
                message: JSON.stringify(fileMessage),
                status: 'delivered',
                timestamp
            });
            return;
        }

        this.safeSend('receive-p2p-message', {
            id: messageId,
            upeerId,
            isMine: false,
            message: JSON.stringify(fileMessage),
            status: 'delivered',
            timestamp
        });
        debug('notifyReceiveMessage: adjunto emitido a la UI', { upeerId, fileId: transfer.fileId, messageId, state: transfer.state, hasWindow: !!this.window }, 'file-transfer');
    }

    public safeSend(channel: string, data: unknown) {
        if (!this.window || this.window.isDestroyed()) return;
        try {
            if (this.window.webContents && !this.window.webContents.isDestroyed()) {
                this.window.webContents.send(channel, data);
            }
        } catch (err) {
            warn('Failed to send file-transfer UI event', { channel, err: String(err) }, 'ipc');
        }
    }

    private mapToUI(transfer: FileTransfer) {
        const progress = transfer.totalChunks > 0
            ? Number(((transfer.chunksProcessed / transfer.totalChunks) * 100).toFixed(2))
            : 0;
        const bytesTransferred = Math.min(transfer.chunksProcessed * transfer.chunkSize, transfer.fileSize);

        return {
            fileId: transfer.messageId || transfer.fileId,
            sessionFileId: transfer.fileId,
            messageId: transfer.messageId || transfer.fileId,
            upeerId: transfer.upeerId,
            chatUpeerId: transfer.chatUpeerId,
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
            isVoiceNote: !!transfer.isVoiceNote,
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
