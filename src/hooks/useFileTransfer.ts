import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { aggregateTransfers, buildTransferError, formatTransferFileSize, formatTransferProgress } from './fileTransferSupport.js';
import { registerFileTransferListeners } from './useFileTransferListeners.js';
import type { FileTransfer, SaveFileParams, StartTransferParams, TransferProgress, TransferStateUpdate } from './fileTransferTypes.js';

export type { FileTransfer, SaveFileParams, StartTransferParams, TransferProgress, TransferStateUpdate } from './fileTransferTypes.js';

export function useFileTransfer(onTransferStateChange?: (fileId: string, updates: TransferStateUpdate) => void) {
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [selectedUpeerId, setSelectedUpeerId] = useState<string>('');

  const onTransferStateChangeRef = useRef(onTransferStateChange);
  useEffect(() => {
    onTransferStateChangeRef.current = onTransferStateChange;
  });

  const allTransfers = useMemo(() => {
    return transfers;
  }, [transfers]);

  const loadTransfers = useCallback(async () => {
    try {
      const result = await window.upeer.getFileTransfers();
      if (result.success && result.transfers) {
        const transfersList = Array.isArray(result.transfers)
          ? result.transfers
          : Object.values(result.transfers);
        setTransfers(aggregateTransfers(transfersList as FileTransfer[]));
      }
    } catch {
      setTransfers((prev) => prev);
    }
  }, []);

  const updateTransferProgress = useCallback((progress: TransferProgress) => {
    if ((progress.messageId && progress.messageId !== progress.sessionFileId) || (progress.chatUpeerId && progress.chatUpeerId.startsWith('grp-'))) {
      loadTransfers();
      return;
    }

    setTransfers(prev => {
      const exists = prev.some(t => t.fileId === progress.fileId && t.direction === progress.direction);

      // If the transfer doesn't exist in our state yet (race condition), load all
      if (!exists) {
        loadTransfers();
        return prev;
      }

      const updated = prev.map(transfer => {
        if (transfer.fileId === progress.fileId && transfer.direction === progress.direction) {
          // Use state from progress if available, otherwise keep current state
          const newState = progress.state || transfer.state;

          return {
            ...transfer,
            state: newState as FileTransfer['state'],
            phase: progress.phase !== undefined ? progress.phase : transfer.phase,
            progress: progress.progress,
            bytesTransferred: progress.bytesTransferred,
            totalBytes: progress.totalBytes || transfer.fileSize,
            chunksTransferred: progress.chunksTransferred,
            isVaulting: progress.isVaulting,
            lastActivity: Date.now()
          } as FileTransfer;
        }
        return transfer;
      });
      return updated;
    });
  }, []);

  useEffect(() => {
    void loadTransfers();
  }, [loadTransfers]);

  useEffect(() => {
    return registerFileTransferListeners({ loadTransfers, updateTransferProgress, setTransfers, onTransferStateChangeRef });
  }, [loadTransfers, updateTransferProgress]);

  const startTransfer = async (params: StartTransferParams): Promise<{ success: boolean; fileId?: string; error?: string }> => {
    try {
      const result = await window.upeer.startFileTransfer(
        params.upeerId,
        params.filePath,
        params.thumbnail,
        params.caption,
        params.isVoiceNote,
        params.fileName
      );

      if (result.success) {
        await loadTransfers();
      }

      return result;
    } catch (error) {
      return buildTransferError(error);
    }
  };

  const cancelTransfer = async (fileId: string, reason?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await window.upeer.cancelFileTransfer(fileId, reason);
      if (result.success) {
        await loadTransfers();
      }
      return result;
    } catch (error) {
      return buildTransferError(error);
    }
  };

  const retryTransfer = async (fileId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await window.upeer.retryFileTransfer(fileId);
      if (result.success) {
        onTransferStateChangeRef.current?.(fileId, { transferState: 'pending' });
        await loadTransfers();
      }
      return result;
    } catch (error) {
      return buildTransferError(error);
    }
  };

  const saveFile = async (params: SaveFileParams): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await window.upeer.saveTransferredFile(params.fileId, params.destinationPath);
      return result;
    } catch (error) {
      return buildTransferError(error);
    }
  };

  const getTransfer = (fileId: string): FileTransfer | undefined => {
    return transfers.find(t => t.fileId === fileId);
  };

  const getTransfersForContact = (upeerId: string): FileTransfer[] => {
    return transfers.filter(t => t.upeerId === upeerId);
  };

  const openFilePicker = (upeerId: string) => {
    setSelectedUpeerId(upeerId);
    setIsFilePickerOpen(true);
  };

  const closeFilePicker = () => {
    setIsFilePickerOpen(false);
    setSelectedUpeerId('');
  };

  return {
    transfers,
    allTransfers,
    isFilePickerOpen,
    selectedUpeerId,

    // Actions
    startTransfer,
    cancelTransfer,
    retryTransfer,
    saveFile,
    getTransfer,
    getTransfersForContact,
    openFilePicker,
    closeFilePicker,

    formatFileSize: formatTransferFileSize,
    formatProgress: formatTransferProgress,
    loadTransfers
  };
}

export type FileTransferController = ReturnType<typeof useFileTransfer>;