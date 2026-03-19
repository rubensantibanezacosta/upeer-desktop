import { BrowserWindow } from 'electron';
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

export class TransferManager implements ITransferManager {
    public store: FileTransferStore;
    public chunker: FileChunker;
    public validator: TransferValidator;
    public config: TransferConfig;
    public ui: UINotifier;

    private sendFunction?: (address: string, data: any, publicKey?: string) => void;
    private fileHandles = new Map<string, any>(); // fileId -> fs.FileHandle
    public transferKeys = new Map<string, Buffer>(); // fileId -> AES key
    private retryTimers = new Map<string, any>(); // fileId -> timer (single timer per transfer)

    constructor(config: Partial<TransferConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.store = new FileTransferStore();
        this.chunker = new FileChunker(this.config.maxChunkSize);
        this.validator = new TransferValidator(this.config.maxFileSize);
        this.ui = new UINotifier(null);
    }

    initialize(sendFunction: (address: string, data: any, publicKey?: string) => void, window: BrowserWindow) {
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
    public handleFileCancel = receiver.handleFileCancel;
    public handleHeartbeat = receiver.handleHeartbeat;

    public getAllTransfers() {
        return this.store.getAllTransfers();
    }

    public getTransfer(fileId: string, direction: 'sending' | 'receiving') {
        return this.store.getTransfer(fileId, direction);
    }

    /**
     * Retries a transfer if we have the file path
     */
    public async retryTransfer(fileId: string) {
        const transfer = this.store.getTransfer(fileId, 'sending');
        if (!transfer) return;

        if (transfer.state === 'failed' || transfer.state === 'cancelled') {
            this.store.updateTransfer(fileId, 'sending', { state: 'active', phase: TransferPhase.TRANSFERRING });
            debug('Retrying transfer', { fileId, peer: transfer.peerAddress }, 'file-transfer');
            this.sendNextChunks(transfer, transfer.peerAddress);
        }
    }

    // --- MESSAGE DISPATCHER ---

    public async handleMessage(upeerId: string, address: string, data: any) {
        if (!data.type) return;

        switch (data.type) {
            case 'FILE_PROPOSAL':
            case 'FILE_START':
                await this.handleFileProposal(upeerId, address, data);
                break;
            case 'FILE_ACCEPT':
                await this.handleAccept(upeerId, address, data);
                break;
            case 'FILE_CHUNK':
                await this.handleFileChunk(upeerId, address, data);
                break;
            case 'FILE_CHUNK_ACK':
            case 'FILE_ACK':
                await this.handleAck(upeerId, address, data);
                break;
            case 'FILE_DONE_ACK':
                await this.handleDoneAck(data.fileId);
                break;
            case 'FILE_CANCEL':
            case 'FILE_END':
                await this.handleFileCancel(upeerId, address, data);
                break;
            case 'FILE_HEARTBEAT':
                this.handleHeartbeat(upeerId, address, data);
                break;
        }
    }

    // --- CORE SHARED LOGIC ---

    public send(address: string, data: any, publicKey?: string) {
        if (this.sendFunction) {
            this.sendFunction(address, data, publicKey);
        } else {
            error('Send function not initialized in TransferManager', undefined, 'file-transfer');
        }
    }

    public getFileHandle(fileId: string) {
        return this.fileHandles.get(fileId);
    }

    public setFileHandle(fileId: string, handle: any) {
        this.fileHandles.set(fileId, handle);
    }

    public setRetryTimer(fileId: string, chunkIndex: number, transfer: FileTransfer, address: string) {
        const key = `${fileId}_${chunkIndex}`;
        if (this.retryTimers.has(key)) return;

        const timer = setTimeout(() => {
            this.retryTimers.delete(key);
            const current = this.store.getTransfer(fileId, 'sending');
            if (current && current.state === 'active') {
                // Si el chunk aún no ha sido procesado (confirmado por ACK)
                if (current.chunksProcessed <= chunkIndex) {
                    debug('Retrying chunk due to timeout', { fileId, chunkIndex }, 'file-transfer');
                    this.sendNextChunks(current, address);
                }
            }
        }, 5000);

        this.retryTimers.set(key, timer);
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

    public async finalizeTransfer(fileId: string, direction: 'sending' | 'receiving') {
        const transfer = this.store.getTransfer(fileId, direction);
        if (!transfer || transfer.state === 'completed') return;

        this.store.updateTransfer(fileId, direction, {
            state: 'completed',
            phase: TransferPhase.DONE
        });

        this.clearRetryTimer(fileId);

        const handle = this.fileHandles.get(fileId);
        if (handle) {
            await handle.close();
            this.fileHandles.delete(fileId);
        }

        const updated = this.store.getTransfer(fileId, direction);
        if (!updated) return;

        if (updated.direction === 'receiving') {
            try {
                const { validator } = this;
                await validator.verifyFileHash(updated, updated.fileHash!);
            } catch (err) {
                error('Error validating file hash', err, 'file-transfer');
                this.cancelTransfer(updated.fileId, 'receiving', 'hash_mismatch');
                const { getContactByUpeerId } = await import('../../storage/contacts/operations.js');
                const contact = await getContactByUpeerId(updated.upeerId);
                this.send(updated.peerAddress, { type: 'FILE_CANCEL', fileId: updated.fileId, reason: 'hash_mismatch' }, contact?.publicKey);
                return;
            }
        }

        this.ui.notifyCompleted(updated);
        const { saveTransferToDB } = await import('./db-helper.js');
        await saveTransferToDB(updated);

        if (updated.direction === 'sending') {
            const { updateTransferMessageStatus } = await import('./db-helper.js');
            if (await updateTransferMessageStatus(fileId, 'delivered')) {
                this.ui.safeSend('message-delivered', { id: fileId, upeerId: updated.upeerId });
                this.ui.notifyStatusUpdated(fileId, 'delivered');
            }
        }
    }

    public async handleDoneAck(fileId: string) {
        await this.finalizeTransfer(fileId, 'sending');
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
            else return; // Transfer not found

            if (typeof directionOrReason === 'string') reason = directionOrReason;
        }

        const transfer = this.store.getTransfer(fileId, direction);
        if (!transfer) return;

        this.store.updateTransfer(fileId, direction, { state: 'cancelled' });

        this.clearRetryTimer(fileId);
        this.transferKeys.delete(fileId);

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

