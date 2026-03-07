import { useState, useEffect, useCallback, useMemo } from 'react';

// Types for file transfers
export interface FileTransfer {
  fileId: string;
  revelnestId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  chunkSize: number;
  fileHash: string;
  thumbnail?: string;

  // Transfer state
  state: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
  phase?: number;
  direction: 'sending' | 'receiving';
  chunksReceived: number[];
  chunksAcked: number[];
  chunksSent: number[];

  // Progress
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  chunksTransferred: number;

  // Timing
  startedAt: number;
  lastActivity: number;

  // File data
  tempPath?: string;
  filePath?: string;
}

export interface TransferProgress {
  fileId: string;
  revelnestId: string;
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  chunksTransferred: number;
  totalChunks: number;
  direction: 'sending' | 'receiving';
  state?: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
  phase?: number;
}

export interface StartTransferParams {
  revelnestId: string;
  filePath: string;
  thumbnail?: string;
}

export interface SaveFileParams {
  fileId: string;
  destinationPath: string;
}

export function useFileTransfer() {
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [selectedRevelnestId, setSelectedRevelnestId] = useState<string>('');

  const allTransfers = useMemo(() => {
    return transfers;
  }, [transfers]);

  // Load initial transfers
  useEffect(() => {
    loadTransfers();
  }, []);

  // Setup event listeners for file transfer events
  useEffect(() => {
    console.log('useFileTransfer: Setting up event listeners');

    window.revelnest.onFileTransferStarted((data: any) => {
      console.log('useFileTransfer: File transfer started event:', data);
      loadTransfers();
    });

    window.revelnest.onFileTransferProgress((data: any) => {
      console.log('File transfer progress event:', data);
      updateTransferProgress(data);
    });

    window.revelnest.onFileTransferCompleted((data: any) => {
      console.log('File transfer completed:', data);
      // Optimistic immediate update
      setTransfers(prev => prev.map(t =>
        t.fileId === data.fileId ? { ...t, state: 'completed', progress: 100 } : t
      ));
      loadTransfers();
    });

    window.revelnest.onFileTransferCancelled((data: any) => {
      console.log('File transfer cancelled:', data);
      loadTransfers();
    });

    window.revelnest.onFileTransferFailed((data: any) => {
      console.log('File transfer failed:', data);
      loadTransfers();
    });
  }, []);

  const loadTransfers = async () => {
    try {
      const result = await window.revelnest.getFileTransfers();
      console.log('Loaded transfers result:', result);
      if (result.success && result.transfers) {
        const transfersList = Array.isArray(result.transfers)
          ? result.transfers
          : Object.values(result.transfers);
        console.log('Setting transfers list:', transfersList.length, transfersList.map(t => ({ fileId: t.fileId, direction: t.direction, state: t.state, progress: t.progress })));
        setTransfers(transfersList);
      }
    } catch (error) {
      console.error('Error loading transfers:', error);
    }
  };

  const updateTransferProgress = (progress: TransferProgress) => {
    console.log('File transfer progress received:', progress);
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
            phase: progress.phase !== undefined ? progress.phase : (transfer as any).phase,
            progress: progress.progress,
            bytesTransferred: progress.bytesTransferred,
            totalBytes: progress.totalBytes || transfer.fileSize,
            chunksTransferred: progress.chunksTransferred,
            lastActivity: Date.now()
          } as FileTransfer;
        }
        return transfer;
      });
      return updated;
    });
  };

  const startTransfer = async (params: StartTransferParams): Promise<{ success: boolean; fileId?: string; error?: string }> => {
    try {
      const result = await window.revelnest.startFileTransfer(
        params.revelnestId,
        params.filePath,
        params.thumbnail
      );

      if (result.success) {
        await loadTransfers();
      }

      return result;
    } catch (error) {
      console.error('Error starting transfer:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  const cancelTransfer = async (fileId: string, reason?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await window.revelnest.cancelFileTransfer(fileId, reason);
      if (result.success) {
        await loadTransfers();
      }
      return result;
    } catch (error) {
      console.error('Error cancelling transfer:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  const saveFile = async (params: SaveFileParams): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await window.revelnest.saveTransferredFile(params.fileId, params.destinationPath);
      return result;
    } catch (error) {
      console.error('Error saving file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  const getTransfer = (fileId: string): FileTransfer | undefined => {
    return transfers.find(t => t.fileId === fileId);
  };

  const getTransfersForContact = (revelnestId: string): FileTransfer[] => {
    return transfers.filter(t => t.revelnestId === revelnestId);
  };

  const openFilePicker = (revelnestId: string) => {
    setSelectedRevelnestId(revelnestId);
    setIsFilePickerOpen(true);
  };

  const closeFilePicker = () => {
    setIsFilePickerOpen(false);
    setSelectedRevelnestId('');
  };

  const formatFileSize = (bytes?: number): string => {
    const num = bytes || 0;
    if (num === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return parseFloat((num / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatProgress = (transfer: FileTransfer): string => {
    if (transfer.state === 'completed') return 'Completado';
    if (transfer.state === 'failed') return 'Falló';
    if (transfer.state === 'cancelled') return 'Cancelado';
    return `${(transfer.progress || 0).toFixed(1)}%`;
  };

  return {
    transfers,
    allTransfers,
    isFilePickerOpen,
    selectedRevelnestId,

    // Actions
    startTransfer,
    cancelTransfer,
    saveFile,
    getTransfer,
    getTransfersForContact,
    openFilePicker,
    closeFilePicker,

    // Utilities
    formatFileSize,
    formatProgress,
    loadTransfers
  };
}