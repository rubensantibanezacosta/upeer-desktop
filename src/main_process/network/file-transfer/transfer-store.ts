import crypto from 'node:crypto';
import { FileTransfer, TransferPhase } from './types.js';

export class FileTransferStore {
    private transfers = new Map<string, FileTransfer>();

    createTransfer(data: {
        fileId?: string;
        messageId?: string;
        upeerId: string;
        chatUpeerId?: string;
        persistMessage?: boolean;
        peerAddress: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        totalChunks: number;
        chunkSize: number;
        fileHash: string;
        thumbnail?: string;
        direction: 'sending' | 'receiving';
        filePath?: string;
        caption?: string;
        sanitizedPath?: string;
        isVoiceNote?: boolean;
    }): FileTransfer {
        const fileId = data.fileId || crypto.randomUUID();

        const transfer: FileTransfer = {
            fileId,
            messageId: data.messageId || fileId,
            upeerId: data.upeerId,
            chatUpeerId: data.chatUpeerId,
            persistMessage: data.persistMessage ?? true,
            peerAddress: data.peerAddress,
            fileName: data.fileName,
            fileSize: data.fileSize,
            mimeType: data.mimeType,
            totalChunks: data.totalChunks,
            chunkSize: data.chunkSize,
            fileHash: data.fileHash,
            thumbnail: data.thumbnail,
            caption: data.caption,
            state: 'pending',
            phase: TransferPhase.PROPOSED,
            direction: data.direction,
            chunksProcessed: 0,
            startedAt: Date.now(),
            lastActivity: Date.now(),
            pendingChunks: new Set(),
            filePath: data.filePath,
            sanitizedPath: data.sanitizedPath,
            isVoiceNote: data.isVoiceNote,
            windowSize: 16,
            ssthresh: 48,
            srtt: 200,
            rto: 400,
            consecutiveAcks: 0,
            nextChunkIndex: 0
        };

        const key = this.makeKey(fileId, data.direction);
        this.transfers.set(key, transfer);
        return transfer;
    }

    private makeKey(fileId: string, direction: string): string {
        return `${fileId}_${direction}`;
    }

    getTransfer(fileId: string, direction: 'sending' | 'receiving'): FileTransfer | undefined {
        return this.transfers.get(this.makeKey(fileId, direction));
    }

    updateTransfer(fileId: string, direction: 'sending' | 'receiving', updates: Partial<FileTransfer>): FileTransfer | undefined {
        const key = this.makeKey(fileId, direction);
        const transfer = this.transfers.get(key);
        if (!transfer) return undefined;

        const updated = { ...transfer, ...updates, lastActivity: Date.now() };
        this.transfers.set(key, updated);
        return updated;
    }

    removeTransfer(fileId: string, direction: 'sending' | 'receiving'): void {
        this.transfers.delete(this.makeKey(fileId, direction));
    }

    getAllTransfers(): FileTransfer[] {
        return Array.from(this.transfers.values()).map(transfer => {
            const cleanTransfer: Partial<FileTransfer> = {};
            for (const key in transfer) {
                const typedKey = key as keyof FileTransfer;
                if (Object.prototype.hasOwnProperty.call(transfer, typedKey)) {
                    if (!key.startsWith('_') && key !== 'fileBuffer' && key !== 'pendingChunks') {
                        cleanTransfer[typedKey] = transfer[typedKey];
                    }
                }
            }
            return cleanTransfer as FileTransfer;
        });
    }

    clear(): void {
        this.transfers.clear();
    }
}