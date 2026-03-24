import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

// Types for file transfers
export interface FileTransfer {
  fileId: string;
  sessionFileId?: string;
  messageId?: string;
  upeerId: string;
  chatUpeerId?: string;
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
  isVaulting?: boolean;

  // Timing
  startedAt: number;
  lastActivity: number;

  // File data
  tempPath?: string;
  filePath?: string;
}

export interface TransferProgress {
  fileId: string;
  sessionFileId?: string;
  messageId?: string;
  upeerId: string;
  chatUpeerId?: string;
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  chunksTransferred: number;
  totalChunks: number;
  direction: 'sending' | 'receiving';
  state?: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
  phase?: number;
  isVaulting?: boolean;
}

export interface StartTransferParams {
  upeerId: string;
  filePath: string;
  thumbnail?: string;
  caption?: string;
  isVoiceNote?: boolean;
  fileName?: string;
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
  savedPath?: string;
};

const aggregateTransfers = (transfersList: FileTransfer[]): FileTransfer[] => {
  const grouped = new Map<string, FileTransfer[]>();

  for (const transfer of transfersList) {
    const logicalId = transfer.messageId || transfer.fileId;
    const key = `${transfer.direction}:${logicalId}`;
    const bucket = grouped.get(key) || [];
    bucket.push(transfer);
    grouped.set(key, bucket);
  }

  return Array.from(grouped.values()).map((group) => {
    const base = group[0];
    if (group.length === 1) {
      return {
        ...base,
        fileId: base.messageId || base.fileId,
      };
    }

    const totalBytes = group.reduce((sum, item) => sum + (item.totalBytes || item.fileSize || 0), 0);
    const bytesTransferred = group.reduce((sum, item) => sum + (item.bytesTransferred || 0), 0);
    const completed = group.filter((item) => item.state === 'completed').length;
    const failed = group.some((item) => item.state === 'failed');
    const cancelled = group.some((item) => item.state === 'cancelled');
    const active = group.some((item) => item.state === 'active' || item.state === 'pending');
    const progress = totalBytes > 0 ? Math.min(100, Number(((bytesTransferred / totalBytes) * 100).toFixed(2))) : 0;

    let state: FileTransfer['state'] = 'pending';
    if (completed === group.length) state = 'completed';
    else if (active) state = 'active';
    else if (failed) state = 'failed';
    else if (cancelled) state = 'cancelled';

    return {
      ...base,
      fileId: base.messageId || base.fileId,
      progress,
      bytesTransferred,
      totalBytes,
      chunksTransferred: group.reduce((sum, item) => sum + (item.chunksTransferred || 0), 0),
      totalChunks: group.reduce((sum, item) => sum + (item.totalChunks || 0), 0),
      state,
      isVaulting: group.some((item) => item.isVaulting),
      lastActivity: Math.max(...group.map((item) => item.lastActivity || 0)),
    } as FileTransfer;
  });
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

  const loadTransfers = async () => {
    try {
      const result = await window.upeer.getFileTransfers();
      if (result.success && result.transfers) {
        const transfersList = Array.isArray(result.transfers)
          ? result.transfers
          : Object.values(result.transfers);
        setTransfers(aggregateTransfers(transfersList as FileTransfer[]));
      }
    } catch (error) {
      console.error('Error loading transfers:', error);
    }
  };

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
            phase: progress.phase !== undefined ? progress.phase : (transfer as any).phase,
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
      onTransferStateChangeRef.current?.(data.messageId || data.fileId, {
        fileHash: data.fileHash,
        transferState: 'completed',
        savedPath: data.direction === 'receiving' ? data.tempPath : undefined
      });
    });

    window.upeer.onFileTransferCancelled((data: any) => {
      loadTransfers();
      onTransferStateChangeRef.current?.(data.messageId || data.fileId, { transferState: 'cancelled' });
    });

    window.upeer.onFileTransferFailed((data: any) => {
      loadTransfers();
      onTransferStateChangeRef.current?.(data.messageId || data.fileId, { transferState: 'failed' });
    });
  }, [updateTransferProgress]);

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

  const retryTransfer = async (fileId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await window.upeer.retryFileTransfer(fileId);
      if (result.success) {
        // Al reintentar, actualizamos el estado del mensaje localmente a 'active' o 'pending'
        onTransferStateChangeRef.current?.(fileId, { transferState: 'pending' });
        await loadTransfers();
      }
      return result;
    } catch (error) {
      console.error('Error retrying transfer:', error);
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
    retryTransfer,
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