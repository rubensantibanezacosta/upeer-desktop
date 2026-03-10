import { useState, useEffect, useMemo, useRef } from 'react';

// Types for file transfers
export interface FileTransfer {
  fileId: string;
  upeerId: string;
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
  upeerId: string;
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
  upeerId: string;
  filePath: string;
  thumbnail?: string;
}

export interface SaveFileParams {
  fileId: string;
  destinationPath: string;
}

export type TransferStateUpdate = {
  fileHash?: string;
  thumbnail?: string;
  transferState?: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
  direction?: 'sending' | 'receiving';
};

export function useFileTransfer(onTransferStateChange?: (fileId: string, updates: TransferStateUpdate) => void) {
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [selectedUpeerId, setSelectedUpeerId] = useState<string>('');

  // BUG DT fix: ref estable para el callback externo; evita que onTransferStateChange
  // sea una dependencia del useEffect y no provoca re-registro de listeners.
  const onTransferStateChangeRef = useRef(onTransferStateChange);
  useEffect(() => {
    onTransferStateChangeRef.current = onTransferStateChange;
  });

  const allTransfers = useMemo(() => {
    return transfers;
  }, [transfers]);

  // Load initial transfers
  useEffect(() => {
    loadTransfers();
  }, []);

  // Setup event listeners for file transfer events
  // BUG DT fix: registro único aquí; el callback onTransferStateChange (de App.tsx)
  // se llama vía ref para no duplicar registros ni silenciar ninguno de los dos handlers.
  useEffect(() => {
    window.upeer.onFileTransferStarted((_data: any) => {
      loadTransfers();
    });

    window.upeer.onFileTransferProgress((data: any) => {
      updateTransferProgress(data);
    });

    window.upeer.onFileTransferCompleted((data: any) => {
      // Optimistic immediate update
      setTransfers(prev => prev.map(t =>
        t.fileId === data.fileId ? { ...t, state: 'completed', progress: 100 } : t
      ));
      loadTransfers();
      // Notifica a useChatState para actualizar el mensaje del chat
      onTransferStateChangeRef.current?.(data.fileId, {
        fileHash: data.fileHash,
        transferState: 'completed'
      });
    });

    window.upeer.onFileTransferCancelled((data: any) => {
      loadTransfers();
      onTransferStateChangeRef.current?.(data.fileId, { transferState: 'cancelled' });
    });

    window.upeer.onFileTransferFailed((data: any) => {
      loadTransfers();
      onTransferStateChangeRef.current?.(data.fileId, { transferState: 'failed' });
    });
  }, []);

  const loadTransfers = async () => {
    try {
      const result = await window.upeer.getFileTransfers();
      if (result.success && result.transfers) {
        const transfersList = Array.isArray(result.transfers)
          ? result.transfers
          : Object.values(result.transfers);
        setTransfers(transfersList);
      }
    } catch (error) {
      console.error('Error loading transfers:', error);
    }
  };

  const updateTransferProgress = (progress: TransferProgress) => {
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
      const result = await window.upeer.startFileTransfer(
        params.upeerId,
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
      const result = await window.upeer.cancelFileTransfer(fileId, reason);
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
      const result = await window.upeer.saveTransferredFile(params.fileId, params.destinationPath);
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
    selectedUpeerId,

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