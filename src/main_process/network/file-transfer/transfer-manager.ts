import { BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { FileTransfer, TransferState, TransferPhase, DEFAULT_CONFIG, TransferConfig } from './types.js';
import { FileTransferStore } from './transfer-store.js';
import { FileChunker } from './chunker.js';
import { TransferValidator } from './validator.js';
import { info, warn, error } from '../../security/secure-logger.js';
import { getMyRevelNestId } from '../../security/identity.js';
import { saveFileMessage } from '../../storage/db.js';

export class TransferManager {
    private store: FileTransferStore;
    private chunker: FileChunker;
    private validator: TransferValidator;
    private config: TransferConfig;
    private sendFunction?: (address: string, data: any) => void;
    private window?: BrowserWindow | null;
    private fileHandles = new Map<string, any>(); // fileId -> fs.FileHandle

    constructor(config: Partial<TransferConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.store = new FileTransferStore();
        this.chunker = new FileChunker(this.config.maxChunkSize);
        this.validator = new TransferValidator(this.config.maxFileSize);
    }

    initialize(sendFunction: (address: string, data: any) => void, window: BrowserWindow) {
        this.setSendFunction(sendFunction);
        this.setWindow(window);
    }

    setWindow(window: BrowserWindow) {
        this.window = window;
    }

    setSendFunction(fn: (address: string, data: any) => void) {
        this.sendFunction = fn;
    }

    // --- PUBLIC API ---

    /**
     * Start sending a file to a peer
     */
    async startSend(revelnestId: string, address: string, filePath: string, thumbnail?: string): Promise<string> {
        try {
            const fileInfo = await this.validator.validateAndPrepareFile(filePath);
            const totalChunks = this.chunker.calculateChunks(fileInfo.size);

            const transfer = this.store.createTransfer({
                revelnestId,
                peerAddress: address,
                fileName: fileInfo.name,
                fileSize: fileInfo.size,
                mimeType: fileInfo.mimeType,
                totalChunks,
                chunkSize: this.config.maxChunkSize,
                fileHash: fileInfo.hash,
                thumbnail,
                direction: 'sending' as const,
                filePath,
                fileBuffer: fileInfo.buffer
            });

            this.store.updateTransfer(transfer.fileId, 'sending', { state: 'active', phase: TransferPhase.PROPOSED });

            // Send Proposal
            this.send(address, {
                type: 'FILE_PROPOSAL',
                fileId: transfer.fileId,
                fileName: transfer.fileName,
                fileSize: transfer.fileSize,
                mimeType: transfer.mimeType,
                totalChunks: transfer.totalChunks,
                chunkSize: transfer.chunkSize,
                fileHash: transfer.fileHash,
                thumbnail
            });

            this.notifyUIStarted(transfer);
            this.saveToDB(transfer);
            return transfer.fileId;
        } catch (err) {
            error('Error starting file transfer', err, 'file-transfer');
            throw err;
        }
    }

    /**
     * Cancel a transfer
     */
    cancelTransfer(fileId: string, reason: string = 'Cancelled by user') {
        const directions: ('sending' | 'receiving')[] = ['sending', 'receiving'];
        directions.forEach(dir => {
            const transfer = this.store.getTransfer(fileId, dir);
            if (transfer && transfer.state === 'active') {
                this.store.updateTransfer(fileId, dir, { state: 'cancelled' });
                // Notify peer
                this.send(transfer.peerAddress, { type: 'FILE_CANCEL', fileId, reason });
                this.notifyUICancelled(transfer, reason);

                // Close handles if any
                const handle = this.fileHandles.get(fileId);
                if (handle) {
                    handle.close().catch(() => { });
                    this.fileHandles.delete(fileId);
                }
            }
        });
    }

    // --- MESSAGE HANDLERS ---

    async handleMessage(revelnestId: string, address: string, data: any) {
        switch (data.type) {
            case 'FILE_PROPOSAL':
                await this.handleProposal(revelnestId, address, data);
                break;
            case 'FILE_ACCEPT':
                await this.handleAccept(revelnestId, address, data);
                break;
            case 'FILE_CHUNK':
                await this.handleChunk(revelnestId, address, data);
                break;
            case 'FILE_CHUNK_ACK':
                await this.handleChunkAck(revelnestId, address, data);
                break;
            case 'FILE_DONE_ACK':
                await this.handleDoneAck(revelnestId, address, data);
                break;
            case 'FILE_CANCEL':
                await this.handleCancel(revelnestId, address, data);
                break;
        }
    }

    private async handleProposal(revelnestId: string, address: string, data: any) {
        try {
            this.validator.validateIncomingFile(data);

            const transfer = this.store.createTransfer({
                fileId: data.fileId,
                revelnestId,
                peerAddress: address,
                fileName: data.fileName,
                fileSize: data.fileSize,
                mimeType: data.mimeType,
                totalChunks: data.totalChunks,
                chunkSize: data.chunkSize,
                fileHash: data.fileHash || '',
                thumbnail: data.thumbnail,
                direction: 'receiving' as const
            });

            // Create temp file
            await this.chunker.createTempFile(transfer);

            this.store.updateTransfer(data.fileId, 'receiving', {
                state: 'active',
                phase: TransferPhase.READY,
                tempPath: transfer.tempPath
            });

            // Respond that we are ready
            this.send(address, {
                type: 'FILE_ACCEPT',
                fileId: data.fileId
            });

            this.notifyUIStarted(transfer);
            this.saveToDB(transfer);
        } catch (err) {
            error('Error handling file proposal', err, 'file-transfer');
            this.send(address, { type: 'FILE_CANCEL', fileId: data.fileId, reason: 'Rejected by receiver' });
        }
    }

    private async handleAccept(revelnestId: string, address: string, data: any) {
        const transfer = this.store.getTransfer(data.fileId, 'sending');
        if (!transfer || transfer.phase !== TransferPhase.PROPOSED) return;

        const updatedTransfer = this.store.updateTransfer(data.fileId, 'sending', { phase: TransferPhase.TRANSFERRING });

        if (updatedTransfer) this.notifyUIProgress(updatedTransfer);

        // Start sending the first chunks
        this.sendNextChunks(transfer, address);
    }

    private async handleChunk(revelnestId: string, address: string, data: any) {
        const transfer = this.store.getTransfer(data.fileId, 'receiving');
        if (!transfer || transfer.state !== 'active') return;

        try {
            // Write using cached handle for extreme performance
            let handle = this.fileHandles.get(transfer.fileId);
            if (!handle && transfer.tempPath) {
                handle = await fs.open(transfer.tempPath, 'r+');
                this.fileHandles.set(transfer.fileId, handle);
            }

            if (handle) {
                const buffer = Buffer.from(data.data, 'base64');
                const offset = data.chunkIndex * transfer.chunkSize;
                await handle.write(buffer, 0, buffer.length, offset);
            }

            // Mark as processed (Update internal tracker)
            transfer.pendingChunks.add(data.chunkIndex);
            const count = transfer.pendingChunks.size;

            const updatedTransfer = this.store.updateTransfer(transfer.fileId, 'receiving', {
                chunksProcessed: count,
                phase: TransferPhase.TRANSFERRING
            });

            // Send ACK
            this.send(address, {
                type: 'FILE_CHUNK_ACK',
                fileId: transfer.fileId,
                chunkIndex: data.chunkIndex
            });

            if (updatedTransfer) this.notifyUIProgress(updatedTransfer);

            // If all chunks received and not already completing, complete
            if (count === transfer.totalChunks && transfer.phase < TransferPhase.VERIFYING) {
                await this.completeReceiver(transfer, address);
            }
        } catch (err) {
            error('Error writing chunk', err, 'file-transfer');
        }
    }

    private async handleChunkAck(revelnestId: string, address: string, data: any) {
        const transfer = this.store.getTransfer(data.fileId, 'sending');
        if (!transfer || transfer.state !== 'active') return;

        console.log(`[Transfer] Received ACK for chunk ${data.chunkIndex}`);

        transfer.pendingChunks.add(data.chunkIndex);
        const count = transfer.pendingChunks.size;

        const updatedTransfer = this.store.updateTransfer(transfer.fileId, 'sending', {
            chunksProcessed: count
        });

        if (updatedTransfer) {
            // Adaptive Speed Optimization (Congestion Control)
            const chunksSentTimes = (updatedTransfer as any)._chunksSentTimes as Map<number, number>;
            if (chunksSentTimes && chunksSentTimes.has(data.chunkIndex)) {
                const now = Date.now();
                const rtt = now - chunksSentTimes.get(data.chunkIndex)!;

                // Update Smothed RTT and Retransmission Timeout (RTO)
                const currentSrtt = updatedTransfer.srtt || 250;
                const newSrtt = Math.floor(0.8 * currentSrtt + 0.2 * rtt);
                const newRto = Math.max(150, Math.min(3000, newSrtt * 3)); // 3x SRTT for safety, min 150ms

                // Window size update (Simplified TCP Tahoe/Reno style)
                let newWindowSize = updatedTransfer.windowSize || 20;
                let newSsthresh = updatedTransfer.ssthresh || 64;
                let consecutiveAcks = (updatedTransfer.consecutiveAcks || 0) + 1;

                if (newWindowSize < newSsthresh) {
                    // Slow Start: Exponential increase (doubling window every full window of ACKs)
                    // We simplify: increment every ACK
                    newWindowSize += 1;
                } else {
                    // Congestion Avoidance: Linear increase
                    if (consecutiveAcks >= Math.floor(newWindowSize)) {
                        newWindowSize += 1;
                        consecutiveAcks = 0;
                    }
                }

                // Caps
                newWindowSize = Math.min(newWindowSize, 1000);

                this.store.updateTransfer(data.fileId, 'sending', {
                    srtt: newSrtt,
                    rto: newRto,
                    windowSize: newWindowSize,
                    ssthresh: newSsthresh,
                    consecutiveAcks
                });
            }

            this.notifyUIProgress(updatedTransfer);
        }

        if (!updatedTransfer) return;

        if (count === transfer.totalChunks && updatedTransfer.phase < TransferPhase.COMPLETING) {
            // Done sending
            const updated = this.store.updateTransfer(transfer.fileId, 'sending', { phase: TransferPhase.COMPLETING });
            if (updated) this.notifyUIProgress(updated);
        } else if (count < transfer.totalChunks) {
            this.sendNextChunks(updatedTransfer, address);
        }
    }

    private async handleDoneAck(revelnestId: string, address: string, data: any) {
        const transfer = this.store.getTransfer(data.fileId, 'sending');
        if (!transfer || transfer.state === 'completed') return;

        const updated = this.store.updateTransfer(transfer.fileId, 'sending', {
            state: 'completed',
            phase: TransferPhase.DONE
        });

        if (updated) {
            this.saveToDB(updated);
            this.notifyUIProgress(updated);
            this.notifyUICompleted(updated);
            // Also notify that the message is now delivered
            this.window?.webContents.send('message-delivered', {
                id: updated.fileId, // We use fileId as messageId
                revelnestId: updated.revelnestId
            });
        }
    }

    private async handleCancel(revelnestId: string, address: string, data: any) {
        // Cancel both directions if they exist (could be self transfer)
        ['sending', 'receiving'].forEach(async (dir: any) => {
            const transfer = this.store.getTransfer(data.fileId, dir);
            if (transfer) {
                if ((transfer as any)._retryTimer) {
                    clearTimeout((transfer as any)._retryTimer);
                    (transfer as any)._retryTimer = null;
                }

                // Close and remove file handle
                const handle = this.fileHandles.get(data.fileId);
                if (handle) {
                    handle.close().catch(() => { });
                    this.fileHandles.delete(data.fileId);
                }

                this.store.updateTransfer(transfer.fileId, dir, { state: 'cancelled' });
                this.notifyUICancelled(transfer, data.reason);
                this.saveToDB({ ...transfer, state: 'cancelled' } as any);
            }
        });
    }

    // --- INTERNAL HELPERS ---

    private async sendNextChunks(transfer: FileTransfer, address: string) {
        // Tracker de tiempos de envío para retransmisiones
        const chunksSentTimes = (transfer as any)._chunksSentTimes || new Map<number, number>();
        (transfer as any)._chunksSentTimes = chunksSentTimes;

        const maxInFlight = Math.floor(transfer.windowSize || 20);
        const now = Date.now();
        const retryTimeout = transfer.rto || 500;

        // Contar cuántos están "en vuelo" (enviados pero no confirmados por ACK)
        let inFlight = 0;
        let needsRetransmission = false;

        for (const [chunkIndex, sentAt] of chunksSentTimes.entries()) {
            if (!transfer.pendingChunks.has(chunkIndex)) {
                if (now - sentAt < retryTimeout) {
                    inFlight++;
                } else {
                    needsRetransmission = true;
                }
            } else {
                // Limpiar de nuestro mapa si ya fue validado
                chunksSentTimes.delete(chunkIndex);
            }
        }

        // Si detectamos pérdida (retransmisión necesaria), reducimos ventana (Congestion Event)
        if (needsRetransmission) {
            const currentWindow = transfer.windowSize || 20;
            const newSsthresh = Math.max(2, Math.floor(currentWindow / 2));
            console.log(`[Transfer] CONGESTION DETECTED. Window: ${currentWindow} -> 2, ssthresh: ${newSsthresh}, RTO: ${retryTimeout}ms`);
            this.store.updateTransfer(transfer.fileId, 'sending', {
                windowSize: 2, // Volver a slow-start agresivo tras pérdida
                ssthresh: newSsthresh,
                consecutiveAcks: 0
            });
        }

        // Si la ventana está llena, NO podemos enviar chunks nuevos pero SÍ podemos retransmitir
        // chunks que hayan alcanzado su timeout. Por tanto, NO hacemos return.

        // Limit number of retransmissions per call to avoid bursts
        let retransmissionsCount = 0;
        const maxRetransmissionsPerCall = 10;

        // 1. Check for retransmissions first (Prioritize lost chunks)
        for (const [chunkIndex, sentAt] of chunksSentTimes.entries()) {
            if (!transfer.pendingChunks.has(chunkIndex)) {
                if (now - sentAt >= retryTimeout) {
                    if (retransmissionsCount < maxRetransmissionsPerCall) {
                        chunksSentTimes.set(chunkIndex, now);
                        const chunkData = await this.chunker.createChunkData(transfer, chunkIndex);
                        console.log(`[Transfer] Retransmitting chunk ${chunkIndex} (RTO match)`);
                        this.send(address, { type: 'FILE_CHUNK', ...chunkData });
                        retransmissionsCount++;
                    }
                }
            }
        }

        // 2. Send new chunks starting from nextChunkIndex
        let chunksAdded = 0;
        let currentIndex = transfer.nextChunkIndex || 0;

        while (currentIndex < transfer.totalChunks && inFlight + chunksAdded < maxInFlight) {
            if (!transfer.pendingChunks.has(currentIndex)) {
                if (!chunksSentTimes.has(currentIndex)) {
                    // Pre-emptively mark as sent/in-flight before the await to avoid race conditions
                    chunksSentTimes.set(currentIndex, now);
                    chunksAdded++;

                    // Update nextChunkIndex in store immediately
                    this.store.updateTransfer(transfer.fileId, 'sending', {
                        nextChunkIndex: currentIndex + 1
                    });

                    const chunkData = await this.chunker.createChunkData(transfer, currentIndex);
                    console.log(`[Transfer] Sending chunk ${currentIndex}/${transfer.totalChunks}. Window: ${maxInFlight}`);
                    this.send(address, {
                        type: 'FILE_CHUNK',
                        ...chunkData
                    });
                }
            }
            currentIndex++;
        }

        // 3. Always ensure a retry timer is running if we have unacked chunks
        // This prevents the transfer from stalling if the last ACKs are lost or the window is full
        const unackedCount = transfer.totalChunks - transfer.pendingChunks.size;
        if (unackedCount > 0 && !(transfer as any)._retryTimer) {
            // console.log(`[Transfer] Scheduling retry timer (${unackedCount} unacked). Interval: ${retryTimeout + 100}ms`);
            (transfer as any)._retryTimer = setTimeout(() => {
                (transfer as any)._retryTimer = null;
                if (transfer.state === 'active') this.sendNextChunks(transfer, address);
            }, retryTimeout + 100);
        }
    }

    private async completeReceiver(transfer: FileTransfer, address: string) {
        if (transfer.state === 'completed' || transfer.phase >= TransferPhase.VERIFYING) return;
        try {
            this.store.updateTransfer(transfer.fileId, 'receiving', { phase: TransferPhase.VERIFYING });

            // Calculate final hash if needed (skipped for speed in small files if trusted)
            // But let's keep the door open for security

            const updated = this.store.updateTransfer(transfer.fileId, 'receiving', {
                state: 'completed',
                phase: TransferPhase.DONE
            });

            // Tell sender we are DONE
            this.send(address, {
                type: 'FILE_DONE_ACK',
                fileId: transfer.fileId
            });

            // Close and remove file handle
            const handle = this.fileHandles.get(transfer.fileId);
            if (handle) {
                await handle.close();
                this.fileHandles.delete(transfer.fileId);
            }

            if (updated) {
                // Save to DB
                this.saveToDB(updated);
                this.notifyUIProgress(updated); // Send one last progress update with 'completed' state
                this.notifyUICompleted(updated);
            }
            info('File transfer completed', { fileId: transfer.fileId }, 'file-transfer');
        } catch (err) {
            error('Error completing receiver', err, 'file-transfer');
        }
    }

    private send(address: string, data: any) {
        if (this.sendFunction) {
            this.sendFunction(address, data);
        }
    }

    private saveToDB(transfer: FileTransfer) {
        try {
            const myId = getMyRevelNestId();
            const isSelf = transfer.revelnestId === myId;

            // For self-transfers, we only want one entry in the DB.
            // We save it when it's 'sending' (which happens at the end for self-transfer on the sender side).
            // If it's receiving from ourselves, we skip it to avoid duplication in ChatHistory.
            if (isSelf && transfer.direction === 'receiving') {
                return;
            }

            saveFileMessage(
                transfer.fileId, // Use stable transfer ID to prevent duplicates
                transfer.revelnestId,
                transfer.direction === 'sending' || isSelf,
                {
                    fileName: transfer.fileName,
                    fileSize: transfer.fileSize,
                    mimeType: transfer.mimeType,
                    fileHash: transfer.fileHash,
                    tempPath: transfer.tempPath,
                    filePath: transfer.filePath,
                    direction: transfer.direction,
                    transferId: transfer.fileId,
                    thumbnail: transfer.thumbnail,
                    state: transfer.state // Now we include the state in the DB
                } as any,
                undefined,
                isSelf ? 'read' : (transfer.state === 'completed' ? 'delivered' : 'sent')
            );
        } catch (err) {
            warn('Failed to save file message to DB', err, 'file-transfer');
        }
    }

    // --- UI NOTIFICATIONS ---

    private notifyUIStarted(transfer: FileTransfer) {
        this.window?.webContents.send('file-transfer-started', this.mapToUI(transfer));
    }

    private notifyUIProgress(transfer: FileTransfer) {
        const progress = Number(((transfer.chunksProcessed / transfer.totalChunks) * 100).toFixed(2));
        const bytesLoaded = transfer.chunksProcessed * transfer.chunkSize;

        this.window?.webContents.send('file-transfer-progress', {
            ...this.mapToUI(transfer),
            progress,
            bytesTransferred: Math.min(bytesLoaded, transfer.fileSize),
            totalBytes: transfer.fileSize,
            chunksTransferred: transfer.chunksProcessed
        });
    }

    private notifyUICompleted(transfer: FileTransfer) {
        this.window?.webContents.send('file-transfer-completed', this.mapToUI(transfer));
    }

    private notifyUICancelled(transfer: FileTransfer, reason: string) {
        this.window?.webContents.send('file-transfer-cancelled', { ...this.mapToUI(transfer), reason });
    }

    private mapToUI(transfer: FileTransfer) {
        return {
            fileId: transfer.fileId,
            revelnestId: transfer.revelnestId,
            fileName: transfer.fileName,
            fileSize: transfer.fileSize,
            mimeType: transfer.mimeType,
            direction: transfer.direction,
            state: transfer.state,
            phase: transfer.phase,
            chunksProcessed: transfer.chunksProcessed,
            totalChunks: transfer.totalChunks,
            thumbnail: transfer.thumbnail,
            fileHash: transfer.fileHash
        };
    }

    getAllTransfers() {
        return this.store.getAllTransfers();
    }

    getTransfer(fileId: string, direction: 'sending' | 'receiving') {
        return this.store.getTransfer(fileId, direction);
    }
}