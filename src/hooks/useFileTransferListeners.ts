import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { FileTransfer, TransferProgress, TransferStateUpdate } from './fileTransferTypes.js';

interface RegisterFileTransferListenersParams {
    loadTransfers: () => Promise<void>;
    updateTransferProgress: (progress: TransferProgress) => void;
    setTransfers: Dispatch<SetStateAction<FileTransfer[]>>;
    onTransferStateChangeRef: MutableRefObject<((fileId: string, updates: TransferStateUpdate) => void) | undefined>;
}

export const registerFileTransferListeners = ({
    loadTransfers,
    updateTransferProgress,
    setTransfers,
    onTransferStateChangeRef,
}: RegisterFileTransferListenersParams) => {
    const unsubscribeStarted = window.upeer.onFileTransferStarted(() => {
        void loadTransfers();
    }) || (() => undefined);

    const unsubscribeProgress = window.upeer.onFileTransferProgress((data: any) => {
        updateTransferProgress(data);
    }) || (() => undefined);

    const unsubscribeCompleted = window.upeer.onFileTransferCompleted((data: any) => {
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

    const unsubscribeCancelled = window.upeer.onFileTransferCancelled((data: any) => {
        void loadTransfers();
        onTransferStateChangeRef.current?.(data.messageId || data.fileId, { transferState: 'cancelled' });
    }) || (() => undefined);

    const unsubscribeFailed = window.upeer.onFileTransferFailed((data: any) => {
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