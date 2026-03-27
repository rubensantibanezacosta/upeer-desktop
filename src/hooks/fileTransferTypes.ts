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
    state: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
    phase?: number;
    direction: 'sending' | 'receiving';
    chunksReceived: number[];
    chunksAcked: number[];
    chunksSent: number[];
    progress: number;
    bytesTransferred: number;
    totalBytes: number;
    chunksTransferred: number;
    isVaulting?: boolean;
    startedAt: number;
    lastActivity: number;
    tempPath?: string;
    filePath?: string;
    savedPath?: string;
    isVoiceNote?: boolean;
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