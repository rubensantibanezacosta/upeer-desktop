import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { FileTransfer, TransferProgress, TransferStateUpdate } from './fileTransferTypes.js';

interface RegisterFileTransferListenersParams {
    loadTransfers: () => Promise<void>;
    updateTransferProgress: (progress: TransferProgress) => void;
    setTransfers: Dispatch<SetStateAction<FileTransfer[]>>;
    onTransferStateChangeRef: MutableRefObject<((fileId: string, updates: TransferStateUpdate) => void) | undefined>;
    onTransferStartedRef: MutableRefObject<((transfer: TransferStateUpdate & { upeerId?: string; chatUpeerId?: string }) => void) | undefined>;
}

export const registerFileTransferListeners = ({
    loadTransfers,
    updateTransferProgress,
    setTransfers,
    onTransferStateChangeRef,
    onTransferStartedRef,
}: RegisterFileTransferListenersParams) => {
    const unsubscribeStarted = window.upeer.onFileTransferStarted((data) => {
        void loadTransfers();
        onTransferStartedRef.current?.({
            direction: data.direction === 'receiving' || data.direction === 'sending' ? data.direction : undefined,
            upeerId: typeof data.upeerId === 'string' ? data.upeerId : undefined,
            chatUpeerId: typeof data.chatUpeerId === 'string' ? data.chatUpeerId : undefined,
            transferState: 'active',
        });
    }) || (() => undefined);

    const unsubscribeProgress = window.upeer.onFileTransferProgress((data) => {
        updateTransferProgress(data);
    }) || (() => undefined);

    const unsubscribeCompleted = window.upeer.onFileTransferCompleted((data) => {
        setTransfers((prev) => prev.map((transfer) =>
            transfer.fileId === data.fileId ? { ...transfer, state: 'completed', progress: 100 } : transfer,
        ));
        void loadTransfers();
        onTransferStateChangeRef.current?.(data.messageId || data.fileId, {
            fileHash: data.fileHash,
            transferState: 'completed',
            savedPath: data.direction === 'receiving' ? data.tempPath : undefined,
        });
    }) || (() => undefined);

    const unsubscribeCancelled = window.upeer.onFileTransferCancelled((data) => {
        void loadTransfers();
        onTransferStateChangeRef.current?.(data.messageId || data.fileId, { transferState: 'cancelled' });
    }) || (() => undefined);

    const unsubscribeFailed = window.upeer.onFileTransferFailed((data) => {
        void loadTransfers();
        onTransferStateChangeRef.current?.(data.messageId || data.fileId, { transferState: 'failed' });
    }) || (() => undefined);

    return () => {
        unsubscribeStarted();
        unsubscribeProgress();
        unsubscribeCompleted();
        unsubscribeCancelled();
        unsubscribeFailed();
    };
};