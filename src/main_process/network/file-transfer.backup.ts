import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow } from 'electron';
import { getMyUPeerId, encrypt, decrypt } from '../security/identity.js';
import { network, info, warn, error } from '../security/secure-logger.js';
import { FileStartData, FileChunkData, FileEndData, FileAckData, FileCancelData } from './types.js';

// Configuration constants
const MAX_CHUNK_SIZE = 1024 * 64; // 64KB per chunk (safe for UDP with Yggdrasil MTU)
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB maximum file size
const TRANSFER_TIMEOUT = 300000; // 5 minutes timeout for file transfer
const MAX_RETRIES = 3; // Maximum retries for failed chunks

// File transfer states
type TransferState = 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';

interface FileTransfer {
    fileId: string;
    upeerId: string; // Peer ID
    fileName: string;
    fileSize: number;
    mimeType: string;
    totalChunks: number;
    chunkSize: number;
    fileHash: string;
    thumbnail?: string;
    encryptionKey?: string;

    // Transfer state
    state: TransferState;
    direction: 'sending' | 'receiving';
    chunksReceived: Set<number>;
    chunksAcked: Set<number>;
    chunksSent: Set<number>;

    // Timing
    startedAt: number;
    lastActivity: number;

    // File data (for receiving)
    tempPath?: string;
    // For sending
    filePath?: string;
    fileBuffer?: Buffer;
}

export class FileTransferManager {
    private transfers = new Map<string, FileTransfer>();
    private sendFunction?: (address: string, data: any) => void;
    private window?: BrowserWindow | null;

    // Initialize with send function
    initialize(sendFunction: (address: string, data: any) => void, win: BrowserWindow | null) {
        this.sendFunction = sendFunction;
        this.window = win;
        this.startCleanupInterval();
    }

    // Start sending a file
    async startSend(
        upeerId: string,
        peerAddress: string,
        filePath: string,
        thumbnail?: string
    ): Promise<string> {
        // Validate file
        const stats = await fs.stat(filePath);
        if (stats.size > MAX_FILE_SIZE) {
            throw new Error(`File too large: ${stats.size} bytes (max: ${MAX_FILE_SIZE} bytes`);
        }

        // Read file
        const fileBuffer = await fs.readFile(filePath);
        const fileName = path.basename(filePath);
        const mimeType = this.detectMimeType(fileName);

        // Calculate file hash
        const hash = crypto.createHash('sha256');
        hash.update(fileBuffer);
        const fileHash = hash.digest('hex');

        // Determine chunking
        const chunkSize = MAX_CHUNK_SIZE;
        const totalChunks = Math.ceil(fileBuffer.length / chunkSize);

        // Generate unique file ID
        const fileId = crypto.randomUUID();

        // Create transfer record
        const transfer: FileTransfer = {
            fileId,
            upeerId,
            fileName,
            fileSize: fileBuffer.length,
            mimeType,
            totalChunks,
            chunkSize,
            fileHash,
            thumbnail,
            state: 'pending',
            direction: 'sending',
            chunksReceived: new Set(),
            chunksAcked: new Set(),
            chunksSent: new Set(),
            startedAt: Date.now(),
            lastActivity: Date.now(),
            filePath,
            fileBuffer
        };

        this.transfers.set(fileId, transfer);

        // Send FILE_START message
        const fileStart: FileStartData = {
            fileId,
            fileName,
            fileSize: fileBuffer.length,
            mimeType,
            totalChunks,
            fileHash,
            chunkSize,
            thumbnail
        };

        this.send(peerAddress, {
            type: 'FILE_START',
            ...fileStart
        });

        transfer.state = 'active';
        info('File transfer started', {
            fileId, fileName, fileSize: fileBuffer.length, totalChunks
        }, 'file-transfer');

        // Start sending chunks
        this.sendNextChunks(transfer, peerAddress);

        return fileId;
    }

    // Handle incoming FILE_START
    async handleFileStart(
        upeerId: string,
        peerAddress: string,
        data: FileStartData,
        signature: string
    ) {
        // Validate file size
        if (data.fileSize > MAX_FILE_SIZE) {
            this.sendCancel(peerAddress, data.fileId, 'File size exceeds limit');
            return;
        }

        // Create transfer record for receiving
        const transfer: FileTransfer = {
            ...data,
            upeerId,
            state: 'pending',
            direction: 'receiving',
            chunksReceived: new Set(),
            chunksAcked: new Set(),
            chunksSent: new Set(),
            startedAt: Date.now(),
            lastActivity: Date.now()
        };

        this.transfers.set(data.fileId, transfer);

        // Create temporary file
        const tempDir = await fs.mkdtemp(path.join(process.env.TMPDIR || '/tmp', 'upeer-'));
        transfer.tempPath = path.join(tempDir, data.fileId);

        // Initialize file with zeros
        const fd = await fs.open(transfer.tempPath, 'w');
        await fd.truncate(data.fileSize);
        await fd.close();

        transfer.state = 'active';

        // Send ACK for FILE_START
        this.sendAck(peerAddress, data.fileId, true);

        info('File transfer receiving started', {
            fileId: data.fileId, fileName: data.fileName, fileSize: data.fileSize
        }, 'file-transfer');

        // Notify UI
        this.window?.webContents.send('file-transfer-started', {
            fileId: data.fileId,
            upeerId,
            fileName: data.fileName,
            fileSize: data.fileSize,
            mimeType: data.mimeType,
            direction: 'incoming',
            thumbnail: data.thumbnail
        });
    }

    // Handle incoming FILE_CHUNK
    async handleFileChunk(
        upeerId: string,
        peerAddress: string,
        data: FileChunkData,
        signature: string
    ) {
        const transfer = this.transfers.get(data.fileId);
        if (!transfer || transfer.upeerId !== upeerId) {
            warn('Invalid file chunk', { fileId: data.fileId }, 'file-transfer');
            return;
        }

        if (transfer.state !== 'active') {
            return;
        }

        // Validate chunk index
        if (data.chunkIndex < 0 || data.chunkIndex >= transfer.totalChunks) {
            this.sendCancel(peerAddress, data.fileId, 'Invalid chunk index');
            return;
        }

        // Verify chunk hash
        const chunkBuffer = Buffer.from(data.data, 'base64');
        const hash = crypto.createHash('sha256');
        hash.update(chunkBuffer);
        const chunkHash = hash.digest('hex');

        if (chunkHash !== data.chunkHash) {
            warn('Chunk hash mismatch', { fileId: data.fileId, chunkIndex: data.chunkIndex }, 'file-transfer');
            // Request retransmission
            this.sendAck(peerAddress, data.fileId, false, [data.chunkIndex]);
            return;
        }

        // Write chunk to temporary file
        if (transfer.tempPath) {
            const fd = await fs.open(transfer.tempPath, 'r+');
            const offset = data.chunkIndex * transfer.chunkSize;
            await fd.write(chunkBuffer, 0, chunkBuffer.length, offset);
            await fd.close();
        }

        // Mark chunk as received
        transfer.chunksReceived.add(data.chunkIndex);
        transfer.lastActivity = Date.now();

        // Send ACK for this chunk
        this.sendAck(peerAddress, data.fileId, true, undefined, data.chunkIndex);

        // Notify UI of progress
        const progress = Math.round((transfer.chunksReceived.size / transfer.totalChunks) * 100);
        this.window?.webContents.send('file-transfer-progress', {
            fileId: data.fileId,
            upeerId,
            progress,
            chunksReceived: transfer.chunksReceived.size,
            totalChunks: transfer.totalChunks
        });

        // Check if all chunks received
        if (transfer.chunksReceived.size === transfer.totalChunks) {
            await this.completeFileTransfer(transfer, peerAddress);
        }
    }

    // Handle incoming FILE_END
    async handleFileEnd(
        upeerId: string,
        peerAddress: string,
        data: FileEndData,
        signature: string
    ) {
        const transfer = this.transfers.get(data.fileId);
        if (!transfer || transfer.upeerId !== upeerId) {
            return;
        }

        // Verify file hash
        if (transfer.tempPath) {
            const fileBuffer = await fs.readFile(transfer.tempPath);
            const hash = crypto.createHash('sha256');
            hash.update(fileBuffer);
            const fileHash = hash.digest('hex');

            if (fileHash !== data.fileHash) {
                warn('File hash mismatch', { fileId: data.fileId }, 'file-transfer');
                this.sendCancel(peerAddress, data.fileId, 'File hash mismatch');
                return;
            }
        }

        // Mark transfer as completed
        transfer.state = 'completed';
        transfer.lastActivity = Date.now();

        // Send final ACK
        this.sendAck(peerAddress, data.fileId, true);

        // Notify UI
        this.window?.webContents.send('file-transfer-completed', {
            fileId: data.fileId,
            upeerId,
            fileName: transfer.fileName,
            fileSize: transfer.fileSize,
            mimeType: transfer.mimeType,
            tempPath: transfer.tempPath
        });

        info('File transfer completed', { fileId: data.fileId }, 'file-transfer');
    }

    // Handle incoming FILE_ACK
    async handleFileAck(
        upeerId: string,
        peerAddress: string,
        data: FileAckData,
        signature: string
    ) {
        const transfer = this.transfers.get(data.fileId);
        if (!transfer || transfer.upeerId !== upeerId) {
            return;
        }

        transfer.lastActivity = Date.now();

        if (data.chunkIndex !== undefined) {
            // ACK for specific chunk
            if (data.received) {
                transfer.chunksAcked.add(data.chunkIndex);
            }

            // Handle missing chunks
            if (data.missingChunks && data.missingChunks.length > 0) {
                this.retryChunks(transfer, peerAddress, data.missingChunks);
            }
        }

        // Update UI with progress for sending
        if (transfer.direction === 'sending') {
            const progress = Math.round((transfer.chunksAcked.size / transfer.totalChunks) * 100);
            this.window?.webContents.send('file-transfer-progress', {
                fileId: data.fileId,
                upeerId,
                progress,
                chunksSent: transfer.chunksAcked.size,
                totalChunks: transfer.totalChunks
            });
        }
    }

    // Handle incoming FILE_CANCEL
    async handleFileCancel(
        upeerId: string,
        peerAddress: string,
        data: FileCancelData,
        signature: string
    ) {
        const transfer = this.transfers.get(data.fileId);
        if (!transfer || transfer.upeerId !== upeerId) {
            return;
        }

        transfer.state = 'cancelled';
        transfer.lastActivity = Date.now();

        // Cleanup temporary files
        await this.cleanupTransfer(transfer);

        // Notify UI
        this.window?.webContents.send('file-transfer-cancelled', {
            fileId: data.fileId,
            upeerId,
            reason: data.reason
        });

        warn('File transfer cancelled', { fileId: data.fileId, reason: data.reason }, 'file-transfer');
    }

    // Private helper methods
    private send(address: string, data: any) {
        if (!this.sendFunction) {
            throw new Error('FileTransferManager not initialized with send function');
        }
        this.sendFunction(address, data);
    }

    private sendAck(
        address: string,
        fileId: string,
        received: boolean,
        missingChunks?: number[],
        chunkIndex?: number
    ) {
        const ack: FileAckData = {
            fileId,
            chunkIndex,
            received,
            missingChunks
        };

        this.send(address, {
            type: 'FILE_ACK',
            ...ack
        });
    }

    private sendCancel(address: string, fileId: string, reason: string) {
        const cancel: FileCancelData = {
            fileId,
            reason
        };

        this.send(address, {
            type: 'FILE_CANCEL',
            ...cancel
        });
    }

    private async sendNextChunks(transfer: FileTransfer, address: string) {
        if (transfer.direction !== 'sending' || !transfer.fileBuffer) {
            return;
        }

        // Determine which chunks to send (up to 5 in parallel)
        const pendingChunks: number[] = [];
        for (let i = 0; i < transfer.totalChunks; i++) {
            if (!transfer.chunksSent.has(i) && !transfer.chunksAcked.has(i)) {
                pendingChunks.push(i);
                if (pendingChunks.length >= 5) break;
            }
        }

        for (const chunkIndex of pendingChunks) {
            await this.sendChunk(transfer, address, chunkIndex);
        }
    }

    private async sendChunk(transfer: FileTransfer, address: string, chunkIndex: number) {
        if (!transfer.fileBuffer) return;

        const start = chunkIndex * transfer.chunkSize;
        const end = Math.min(start + transfer.chunkSize, transfer.fileBuffer.length);
        const chunkBuffer = transfer.fileBuffer.slice(start, end);

        // Calculate chunk hash
        const hash = crypto.createHash('sha256');
        hash.update(chunkBuffer);
        const chunkHash = hash.digest('hex');

        const chunkData: FileChunkData = {
            fileId: transfer.fileId,
            chunkIndex,
            totalChunks: transfer.totalChunks,
            data: chunkBuffer.toString('base64'),
            chunkHash
        };

        this.send(address, {
            type: 'FILE_CHUNK',
            ...chunkData
        });

        transfer.chunksSent.add(chunkIndex);
        transfer.lastActivity = Date.now();
    }

    private async retryChunks(transfer: FileTransfer, address: string, chunkIndices: number[]) {
        for (const chunkIndex of chunkIndices) {
            await this.sendChunk(transfer, address, chunkIndex);
        }
    }

    private async completeFileTransfer(transfer: FileTransfer, address: string) {
        // Send FILE_END message
        const endData: FileEndData = {
            fileId: transfer.fileId,
            fileHash: transfer.fileHash
        };

        this.send(address, {
            type: 'FILE_END',
            ...endData
        });

        transfer.state = 'completed';
        transfer.lastActivity = Date.now();

        info('File transfer all chunks received', { fileId: transfer.fileId }, 'file-transfer');
    }

    private async cleanupTransfer(transfer: FileTransfer) {
        if (transfer.tempPath) {
            try {
                await fs.unlink(transfer.tempPath);
                const tempDir = path.dirname(transfer.tempPath);
                await fs.rmdir(tempDir);
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    }

    private detectMimeType(fileName: string): string {
        const ext = path.extname(fileName).toLowerCase();
        const mimeMap: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.txt': 'text/plain',
            '.pdf': 'application/pdf',
            '.zip': 'application/zip'
        };
        return mimeMap[ext] || 'application/octet-stream';
    }

    private startCleanupInterval() {
        setInterval(() => {
            const now = Date.now();
            for (const [fileId, transfer] of this.transfers.entries()) {
                // Cleanup stale transfers
                if (now - transfer.lastActivity > TRANSFER_TIMEOUT && transfer.state === 'active') {
                    transfer.state = 'failed';
                    this.cleanupTransfer(transfer);
                    this.transfers.delete(fileId);

                    warn('File transfer timed out', { fileId }, 'file-transfer');

                    this.window?.webContents.send('file-transfer-failed', {
                        fileId,
                        upeerId: transfer.upeerId,
                        reason: 'timeout'
                    });
                }

                // Cleanup completed transfers after 1 hour
                if (transfer.state === 'completed' || transfer.state === 'cancelled' || transfer.state === 'failed') {
                    if (now - transfer.lastActivity > 3600000) {
                        this.cleanupTransfer(transfer);
                        this.transfers.delete(fileId);
                    }
                }
            }
        }, 60000); // Check every minute
    }

    // Public utility methods
    cancelTransfer(fileId: string, reason: string) {
        const transfer = this.transfers.get(fileId);
        if (!transfer) return;

        // Send cancel to peer
        // Note: Need peer address - we should store it in transfer
        // For now, this is for local cancellation only
        transfer.state = 'cancelled';
        this.cleanupTransfer(transfer);

        this.window?.webContents.send('file-transfer-cancelled', {
            fileId,
            upeerId: transfer.upeerId,
            reason
        });
    }

    getTransfer(fileId: string) {
        return this.transfers.get(fileId);
    }

    getAllTransfers() {
        return Array.from(this.transfers.values());
    }
}

// Singleton instance
export const fileTransferManager = new FileTransferManager();