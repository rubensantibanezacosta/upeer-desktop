import { BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { debug, error } from '../../security/secure-logger.js';
import { FileTransfer, TransferPhase, DEFAULT_CONFIG, TransferConfig } from './types.js';
import { FileTransferStore } from './transfer-store.js';
import { FileChunker } from './chunker.js';
import { TransferValidator } from './validator.js';
import { UINotifier } from './ui-notifier.js';
import { ITransferManager } from './interfaces.js';

// Import refactored logic
import * as sender from './sender-logic.js';
import * as receiver from './receiver-logic.js';

type FileTransferPacket = {
    type: string;
    fileId?: string;
    chunkIndex?: number;
    chunkHash?: string;
    data?: string;
    iv?: string;
    tag?: string;
    reason?: string;
    [key: string]: unknown;
};

type RetryTimer = ReturnType<typeof setTimeout>;
type DoneRetryTimer = ReturnType<typeof setInterval>;

async function readChunkFully(handle: FileHandle, length: number, position: number): Promise<Buffer> {
    const buffer = Buffer.alloc(length);
    let offset = 0;

    while (offset < length) {
        const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
        if (bytesRead <= 0) break;
        offset += bytesRead;
    }

    if (offset <= 0) {
        throw new Error('Invalid chunk range or end of file reached');
    }

    return offset < length ? buffer.slice(0, offset) : buffer;
}

export class TransferManager implements ITransferManager {
    public store: FileTransferStore;
    public chunker: FileChunker;
    public validator: TransferValidator;
    public config: TransferConfig;
    public ui: UINotifier;

    private sendFunction?: (address: string, data: FileTransferPacket, publicKey?: string) => void;
    private fileHandles = new Map<string, FileHandle>();
    public transferKeys = new Map<string, Buffer>(); // fileId -> AES key
    private retryTimers = new Map<string, RetryTimer>();
    private finalizingTransfers = new Set<string>(); // fileId_direction in-flight finalization guard
    private donePendingTimers = new Map<string, DoneRetryTimer>();
    private dhtSearchTimestamps = new Map<string, number>(); // upeerId -> last DHT search ts
    public transferLocks = new Map<string, Promise<void>>(); // fileId -> active lock promise
    private activeSendBatches = new Set<string>();

    constructor(config: Partial<TransferConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.store = new FileTransferStore();
        this.chunker = new FileChunker(this.config.maxChunkSize);
        this.validator = new TransferValidator(this.config.maxFileSize);
        this.ui = new UINotifier(null);
    }

    initialize(sendFunction: (address: string, data: FileTransferPacket, publicKey?: string) => void, window: BrowserWindow) {
        this.sendFunction = sendFunction;
        this.ui.setWindow(window);
    }

    // --- REFACTORED DELEGATES ---

    public startSend = sender.startSend;
    public startVaultingFailover = sender.startVaultingFailover;
    public sendNextChunks = sender.sendNextChunks;
    public handleAccept = sender.handleAccept;
    public handleAck = sender.handleAck;

    public handleFileProposal = receiver.handleFileProposal;
    public acceptTransfer = receiver.acceptTransfer;
    public handleFileChunk = receiver.handleFileChunk;
    public handleFileDone = receiver.handleFileDone;
    public handleFileCancel = receiver.handleFileCancel;
    public handleHeartbeat = receiver.handleHeartbeat;

    public getAllTransfers() {
        return this.store.getAllTransfers();
    }

    public getTransfer(fileId: string, direction: 'sending' | 'receiving') {
        return this.store.getTransfer(fileId, direction);
    }

    public findTransfersByMessageId(messageId: string, direction?: 'sending' | 'receiving') {
        return this.store.getAllTransfers().filter((transfer) => {
            const currentMessageId = transfer.messageId || transfer.fileId;
            if (currentMessageId !== messageId) return false;
            return direction ? transfer.direction === direction : true;
        }) as FileTransfer[];
    }

    /**
     * Retries a transfer if we have the file path
     */
    public async retryTransfer(fileId: string) {
        const transfer = this.store.getTransfer(fileId, 'sending');
        if (!transfer) {
            const groupedTransfers = this.findTransfersByMessageId(fileId, 'sending');
            if (groupedTransfers.length === 0) return;
            await Promise.all(groupedTransfers.map((groupedTransfer) => this.retryTransfer(groupedTransfer.fileId)));
            return;
        }

        if (transfer.state === 'failed' || transfer.state === 'cancelled') {
            this.store.updateTransfer(fileId, 'sending', { state: 'active', phase: TransferPhase.TRANSFERRING });
            debug('Retrying transfer', { fileId, peer: transfer.peerAddress }, 'file-transfer');
            this.sendNextChunks(transfer);
        }
    }

    // --- MESSAGE DISPATCHER ---

    public async handleMessage(upeerId: string, address: string, data: FileTransferPacket) {
        if (!data.type) return;

        switch (data.type) {
            case 'FILE_PROPOSAL':
            case 'FILE_START':
                if (typeof data.fileId !== 'string' || typeof data.fileName !== 'string') return;
                await this.handleFileProposal(upeerId, address, {
                    fileId: data.fileId,
                    fileName: data.fileName,
                    fileSize: typeof data.fileSize === 'number' ? data.fileSize : 1,
                    mimeType: typeof data.mimeType === 'string' ? data.mimeType : 'application/octet-stream',
                    totalChunks: typeof data.totalChunks === 'number' ? data.totalChunks : 1,
                    chunkSize: typeof data.chunkSize === 'number' ? data.chunkSize : this.config.maxChunkSize,
                    fileHash: typeof data.fileHash === 'string' ? data.fileHash : '0'.repeat(64),
                    signature: typeof data.signature === 'string' ? data.signature : undefined,
                    encryptedKey: typeof data.encryptedKey === 'string' ? data.encryptedKey : undefined,
                    encryptedKeyNonce: typeof data.encryptedKeyNonce === 'string' ? data.encryptedKeyNonce : undefined,
                    thumbnail: typeof data.thumbnail === 'string' || (typeof data.thumbnail === 'object' && data.thumbnail !== null)
                        ? data.thumbnail as string | { data: string; iv: string; tag: string }
                        : undefined,
                    caption: typeof data.caption === 'string' ? data.caption : undefined,
                    isVoiceNote: data.isVoiceNote === true,
                    messageId: typeof data.messageId === 'string' ? data.messageId : undefined,
                    chatUpeerId: typeof data.chatUpeerId === 'string' ? data.chatUpeerId : undefined,
                });
                break;
            case 'FILE_ACCEPT':
                if (typeof data.fileId !== 'string') return;
                await this.handleAccept(upeerId, address, { fileId: data.fileId, signature: typeof data.signature === 'string' ? data.signature : undefined });
                break;
            case 'FILE_CHUNK':
                if (typeof data.fileId !== 'string' || typeof data.chunkIndex !== 'number' || typeof data.data !== 'string') return;
                await this.handleFileChunk(upeerId, address, {
                    fileId: data.fileId,
                    chunkIndex: data.chunkIndex,
                    data: data.data,
                    chunkHash: typeof data.chunkHash === 'string' ? data.chunkHash : undefined,
                    iv: typeof data.iv === 'string' ? data.iv : undefined,
                    tag: typeof data.tag === 'string' ? data.tag : undefined,
                });
                break;
            case 'FILE_CHUNK_ACK':
            case 'FILE_ACK':
                if (typeof data.fileId !== 'string' || typeof data.chunkIndex !== 'number') return;
                await this.handleAck(upeerId, address, { fileId: data.fileId, chunkIndex: data.chunkIndex });
                break;
            case 'FILE_DONE':
                if (typeof data.fileId !== 'string') return;
                await this.handleFileDone(upeerId, address, { fileId: data.fileId });
                break;
            case 'FILE_DONE_ACK':
                if (typeof data.fileId !== 'string') return;
                await this.handleDoneAck(data.fileId);
                break;
            case 'FILE_CANCEL':
            case 'FILE_END':
                if (typeof data.fileId !== 'string') return;
                await this.handleFileCancel(upeerId, address, { fileId: data.fileId, reason: typeof data.reason === 'string' ? data.reason : undefined });
                break;
            case 'FILE_HEARTBEAT':
                if (typeof data.fileId !== 'string') return;
                this.handleHeartbeat(upeerId, address, { fileId: data.fileId, t: data.t });
                break;
        }
    }

    // --- CORE SHARED LOGIC ---

    public send(address: string, data: FileTransferPacket, publicKey?: string) {
        if (this.sendFunction) {
            this.sendFunction(address, data, publicKey);
        } else {
            error('Send function not initialized in TransferManager', undefined, 'file-transfer');
        }
    }

    public getFileHandle(fileId: string) {
        return this.fileHandles.get(fileId);
    }

    public setFileHandle(fileId: string, handle: FileHandle) {
        this.fileHandles.set(fileId, handle);
    }

    public tryStartSendBatch(fileId: string): boolean {
        if (this.activeSendBatches.has(fileId)) return false;
        this.activeSendBatches.add(fileId);
        return true;
    }

    public finishSendBatch(fileId: string): void {
        this.activeSendBatches.delete(fileId);
    }

    public setRetryTimer(fileId: string, chunkIndex: number, transfer: FileTransfer) {
        const key = `${fileId}_${chunkIndex}`;
        if (this.retryTimers.has(key)) return;

        const timeoutMs = Math.min(5000, Math.max(1200, transfer.rto || 1200));

        const timer = setTimeout(() => {
            this.retryTimers.delete(key);
            const current = this.store.getTransfer(fileId, 'sending');
            if (current && current.state === 'active') {
                const ackedChunks = current._ackedChunks;
                if (!ackedChunks?.has(chunkIndex)) {
                    const currentWindow = Math.max(1, Math.floor(current.windowSize || this.config.initialWindowSize || 40));
                    const reducedSsthresh = Math.max(4, Math.floor(currentWindow / 2));
                    const reducedWindow = Math.max(4, Math.min(reducedSsthresh, currentWindow));
                    const backedOffRto = Math.min(5000, Math.max(1200, (current.rto || timeoutMs) * 2));
                    const throttled = this.store.updateTransfer(fileId, 'sending', {
                        ssthresh: reducedSsthresh,
                        windowSize: reducedWindow,
                        rto: backedOffRto
                    }) || current;

                    debug('Retrying chunk due to timeout', { fileId, chunkIndex }, 'file-transfer');
                    const lastSearch = this.dhtSearchTimestamps.get(current.upeerId) ?? 0;
                    if (Date.now() - lastSearch > 10000) {
                        this.dhtSearchTimestamps.set(current.upeerId, Date.now());
                        import('../dht/core.js').then(({ startDhtSearch }) => {
                            startDhtSearch(current.upeerId, (ip: string, data: FileTransferPacket) => this.send(ip, data));
                        });
                    }
                    this.resendSingleChunk(throttled, chunkIndex);
                }
            }
        }, timeoutMs);

        this.retryTimers.set(key, timer);
    }

    public async resendSingleChunk(transfer: FileTransfer, chunkIndex: number): Promise<void> {
        if (transfer.state !== 'active') return;
        try {
            let handle = this.getFileHandle(transfer.fileId);
            const sourcePath = transfer.sanitizedPath || transfer.filePath;
            if (!handle && sourcePath) {
                const fs = await import('node:fs/promises');
                const h = await fs.open(sourcePath, 'r');
                this.setFileHandle(transfer.fileId, h);
                handle = h;
            }
            if (!handle) return;

            const { encryptChunk } = await import('./crypto.js');
            const { getContactByUpeerId } = await import('../../storage/contacts/operations.js');
            const aesKey = this.transferKeys.get(transfer.fileId);
            const contact = await getContactByUpeerId(transfer.upeerId);
            const freshAddress = contact?.address || transfer.peerAddress;

            const chunkSize = transfer.chunkSize || 16384;
            const fileOffset = chunkIndex * chunkSize;
            const finalBuffer = await readChunkFully(handle, chunkSize, fileOffset);

            const chunkMsg: FileTransferPacket = {
                type: 'FILE_CHUNK',
                fileId: transfer.fileId,
                chunkIndex,
                chunkHash: crypto.createHash('sha256').update(finalBuffer).digest('hex')
            };
            if (aesKey) {
                const enc = encryptChunk(finalBuffer, aesKey);
                chunkMsg.data = enc.data;
                chunkMsg.iv = enc.iv;
                chunkMsg.tag = enc.tag;
            } else {
                chunkMsg.data = finalBuffer.toString('base64');
            }

            this.send(freshAddress, chunkMsg, contact?.publicKey);
            this.setRetryTimer(transfer.fileId, chunkIndex, transfer);
        } catch (err) {
            error('Error resending single chunk', err, 'file-transfer');
        }
    }

    public clearRetryTimer(fileId: string, chunkIndex?: number) {
        if (chunkIndex !== undefined) {
            const key = `${fileId}_${chunkIndex}`;
            const timer = this.retryTimers.get(key);
            if (timer) {
                clearTimeout(timer);
                this.retryTimers.delete(key);
            }
        } else {
            // Limpiar todos los timers para este archivo (útil al finalizar/cancelar)
            for (const [key, timer] of this.retryTimers.entries()) {
                if (key.startsWith(`${fileId}_`)) {
                    clearTimeout(timer);
                    this.retryTimers.delete(key);
                }
            }
        }
    }

    public async withTransferLock<T>(fileId: string, fn: () => Promise<T>): Promise<T> {
        const prev = this.transferLocks.get(fileId) ?? Promise.resolve();
        let release!: () => void;
        const next = new Promise<void>(resolve => { release = resolve; });
        this.transferLocks.set(fileId, next);
        try {
            await prev;
            return await fn();
        } finally {
            release();
            if (this.transferLocks.get(fileId) === next) {
                this.transferLocks.delete(fileId);
            }
        }
    }

    public async finalizeTransfer(fileId: string, direction: 'sending' | 'receiving') {
        const guardKey = `${fileId}_${direction}`;
        if (this.finalizingTransfers.has(guardKey)) return;

        const transfer = this.store.getTransfer(fileId, direction);
        if (!transfer || transfer.state === 'completed') return;

        this.finalizingTransfers.add(guardKey);

        try {
            debug('Finalizing transfer', {
                fileId,
                direction,
                chunksProcessed: transfer.chunksProcessed,
                totalChunks: transfer.totalChunks,
                fileSize: transfer.fileSize,
                tempPath: transfer.tempPath
            }, 'file-transfer');

            this.store.updateTransfer(fileId, direction, {
                state: 'completed',
                phase: TransferPhase.DONE
            });

            this.clearRetryTimer(fileId);
            this.clearDoneRetry(fileId);
            this.transferLocks.delete(fileId);
            this.activeSendBatches.delete(fileId);
            this.dhtSearchTimestamps.delete(transfer.upeerId);

            const handle = this.fileHandles.get(fileId);
            if (handle) {
                await handle.close();
                this.fileHandles.delete(fileId);
            }

            const updated_initial = this.store.getTransfer(fileId, direction);
            if (!updated_initial) return;
            let updated = updated_initial;

            if (updated.direction === 'receiving') {
                try {
                    const { validator } = this;
                    await validator.verifyFileHash(updated, updated.fileHash!);
                } catch (err) {
                    error('Error validating file hash', err, 'file-transfer');
                    this.cancelTransfer(updated.fileId, 'receiving', 'hash_mismatch');
                    const { getContactByUpeerId } = await import('../../storage/contacts/operations.js');
                    const contact = await getContactByUpeerId(updated.upeerId);
                    const freshAddress = contact?.address || updated.peerAddress;
                    this.send(freshAddress, { type: 'FILE_CANCEL', fileId: updated.fileId, reason: 'hash_mismatch' }, contact?.publicKey);
                    return;
                }

                if (updated.tempPath) {
                    try {
                        const fs = await import('node:fs/promises');
                        const path = await import('node:path');
                        const { app } = await import('electron');
                        const assetsDir = path.join(app.getPath('userData'), 'assets', 'received');
                        await fs.mkdir(assetsDir, { recursive: true });
                        const ext = path.extname(updated.fileName) || '';
                        const permanentPath = path.join(assetsDir, `${updated.fileId}${ext}`);
                        await fs.rename(updated.tempPath, permanentPath).catch(() =>
                            fs.copyFile(updated.tempPath!, permanentPath)
                        );
                        this.store.updateTransfer(fileId, 'receiving', { tempPath: permanentPath });
                        updated = this.store.getTransfer(fileId, 'receiving')!;
                    } catch (err) {
                        error('Failed to move received file to assets', err, 'file-transfer');
                    }
                }
            }

            this.ui.notifyCompleted(updated);
            const { saveTransferToDB } = await import('./db-helper.js');
            await saveTransferToDB(updated);

            if (updated.direction === 'sending') {
                const { updateTransferMessageStatus } = await import('./db-helper.js');
                const messageId = updated.messageId || fileId;
                if (await updateTransferMessageStatus(messageId, 'delivered')) {
                    this.ui.safeSend('message-delivered', { id: messageId, upeerId: updated.upeerId });
                    this.ui.notifyStatusUpdated(messageId, 'delivered');
                }
            }
        } finally {
            this.finalizingTransfers.delete(guardKey);
        }
    }

    public async handleDoneAck(fileId: string) {
        this.clearDoneRetry(fileId);
        await this.finalizeTransfer(fileId, 'sending');
    }

    public startDoneRetry(fileId: string, upeerId: string, msg: FileTransferPacket) {
        this.clearDoneRetry(fileId);
        const timer = setInterval(async () => {
            const transfer = this.store.getTransfer(fileId, 'sending');
            if (!transfer || transfer.state !== 'active') {
                this.clearDoneRetry(fileId);
                return;
            }
            const { getContactByUpeerId } = await import('../../storage/contacts/operations.js');
            const contact = await getContactByUpeerId(upeerId);
            const freshAddress = contact?.address || transfer.peerAddress;
            this.send(freshAddress, msg, contact?.publicKey);
        }, 3000);
        this.donePendingTimers.set(fileId, timer);
    }

    public clearDoneRetry(fileId: string) {
        const timer = this.donePendingTimers.get(fileId);
        if (timer) {
            clearInterval(timer);
            this.donePendingTimers.delete(fileId);
        }
    }

    public checkStaleTransfers(timeoutMs = 90_000) {
        const now = Date.now();
        for (const transfer of this.store.getAllTransfers()) {
            if (transfer.state !== 'active') continue;
            if (now - transfer.lastActivity < timeoutMs) continue;

            this.store.updateTransfer(transfer.fileId, transfer.direction, { state: 'failed' });
            this.clearRetryTimer(transfer.fileId);
            this.transferKeys.delete(transfer.fileId);

            const handle = this.fileHandles.get(transfer.fileId);
            if (handle) {
                handle.close().catch(() => { });
                this.fileHandles.delete(transfer.fileId);
            }

            const failedTransfer = this.store.getTransfer(transfer.fileId, transfer.direction) || transfer;
            this.ui.notifyFailed(failedTransfer, 'peer_disconnected');
        }
    }

    public notifyVaultProgress(fileId: string, processed: number, total: number) {
        const transfer = this.store.getTransfer(fileId, 'sending');
        if (!transfer) return;

        const isDone = processed >= total;
        const updates: Partial<FileTransfer> = {
            chunksProcessed: processed,
            totalChunks: total,
            isVaulting: true,
            phase: isDone ? TransferPhase.DONE : TransferPhase.REPLICATING
        };

        const updated = this.store.updateTransfer(fileId, 'sending', updates);
        if (updated) {
            this.ui.notifyProgress(updated, isDone);
        }
    }

    public cancelTransfer(fileId: string, directionOrReason?: 'sending' | 'receiving' | string, reasonText = 'user') {
        let direction: 'sending' | 'receiving';
        let reason = reasonText;

        if (directionOrReason === 'sending' || directionOrReason === 'receiving') {
            direction = directionOrReason as 'sending' | 'receiving';
        } else {
            // If direction is not provided, try to find the transfer
            const sending = this.store.getTransfer(fileId, 'sending');
            const receiving = this.store.getTransfer(fileId, 'receiving');
            if (sending) direction = 'sending';
            else if (receiving) direction = 'receiving';
            else {
                const grouped = this.findTransfersByMessageId(fileId);
                if (grouped.length === 0) return;
                for (const groupedTransfer of grouped) {
                    this.cancelTransfer(groupedTransfer.fileId, groupedTransfer.direction, typeof directionOrReason === 'string' ? directionOrReason : reason);
                }
                return;
            }

            if (typeof directionOrReason === 'string') reason = directionOrReason;
        }

        const transfer = this.store.getTransfer(fileId, direction);
        if (!transfer) return;

        this.store.updateTransfer(fileId, direction, { state: 'cancelled' });

        this.clearRetryTimer(fileId);
        this.clearDoneRetry(fileId);
        this.transferKeys.delete(fileId);
        this.transferLocks.delete(fileId);
        this.activeSendBatches.delete(fileId);
        this.dhtSearchTimestamps.delete(transfer.upeerId);

        const handle = this.fileHandles.get(fileId);
        if (handle) {
            handle.close().catch(() => { });
            this.fileHandles.delete(fileId);
        }

        this.ui.notifyCancelled(transfer, reason);
    }
}

// Singleton instance for the application
export const fileTransferManager = new TransferManager();

// Compatibility Export
export { TransferManager as FileTransferManager };

