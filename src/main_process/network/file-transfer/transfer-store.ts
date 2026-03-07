import crypto from 'node:crypto';
import { FileTransfer, TransferState, TransferPhase } from './types.js';

export class FileTransferStore {
    private transfers = new Map<string, FileTransfer>();

    createTransfer(data: {
        fileId?: string;
        revelnestId: string;
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
        fileBuffer?: Buffer;
    }): FileTransfer {
        const fileId = data.fileId || crypto.randomUUID();

        const transfer: FileTransfer = {
            fileId,
            revelnestId: data.revelnestId,
            peerAddress: data.peerAddress,
            fileName: data.fileName,
            fileSize: data.fileSize,
            mimeType: data.mimeType,
            totalChunks: data.totalChunks,
            chunkSize: data.chunkSize,
            fileHash: data.fileHash,
            thumbnail: data.thumbnail,
            state: 'pending',
            phase: TransferPhase.PROPOSED,
            direction: data.direction,
            chunksProcessed: 0,
            startedAt: Date.now(),
            lastActivity: Date.now(),
            pendingChunks: new Set(),
            filePath: data.filePath,
            fileBuffer: data.fileBuffer,
            windowSize: 20, // initialWindowSize
            ssthresh: 64,   // slow start threshold
            srtt: 250,      // smoothed RTT
            rto: 500,       // initial retransmission timeout
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
            const cleanTransfer: any = {};
            for (const key in transfer) {
                if (Object.prototype.hasOwnProperty.call(transfer, key)) {
                    if (!key.startsWith('_') && key !== 'fileBuffer' && key !== 'pendingChunks') {
                        cleanTransfer[key] = (transfer as any)[key];
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