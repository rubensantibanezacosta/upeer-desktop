import { FileTransferStore } from './transfer-store.js';
import { FileChunker } from './chunker.js';
import { TransferValidator } from './validator.js';
import { UINotifier } from './ui-notifier.js';
import { TransferConfig, FileTransfer } from './types.js';

export interface ITransferManager {
    store: FileTransferStore;
    chunker: FileChunker;
    validator: TransferValidator;
    ui: UINotifier;
    config: TransferConfig;
    transferKeys: Map<string, Buffer>;

    send(address: string, data: any, publicKey?: string): void;
    getFileHandle(fileId: string): any;
    setFileHandle(fileId: string, handle: any): void;
    setRetryTimer(fileId: string, chunkIndex: number, transfer: FileTransfer, address: string): void;
    clearRetryTimer(fileId: string, chunkIndex?: number): void;
    finalizeTransfer(fileId: string, direction: 'sending' | 'receiving'): Promise<void>;
    cancelTransfer(fileId: string, directionOrReason?: 'sending' | 'receiving' | string, reasonText?: string): void;
    startVaultingFailover(fileId: string, upeerId: string, peerPublicKey: string | undefined, aesKey: Buffer | undefined, encThumb: any): Promise<void>;
    notifyVaultProgress(fileId: string, processed: number, total: number): void;
    sendNextChunks(transfer: FileTransfer, address: string): Promise<void>;
}
