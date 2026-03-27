// File transfer types and interfaces rewritten for clarity and reliability


export type TransferState = 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';

/**
 * Transfer Phases for the state machine
 */
export enum TransferPhase {
    PROPOSED = 0,       // Proposal sent, waiting for acceptance
    INITIALIZING = 1, // Accepted, creating local files/buffers
    READY = 2,             // Ready to send/receive chunks
    TRANSFERRING = 3, // Chunks are flying
    VERIFYING = 4,     // All chunks received, checking hash
    COMPLETING = 5,   // Cleaning up and saving
    DONE = 6,               // Finished
    REPLICATING = 7, // Background social mesh replication (offline mode)
    VAULTED = 8           // Fully replicated to custodians
}

export interface FileTransfer {
    fileId: string;
    messageId?: string;
    upeerId: string; // Peer ID
    chatUpeerId?: string;
    persistMessage?: boolean;
    peerAddress: string; // Current IP address of the peer
    fileName: string;
    fileSize: number;
    mimeType: string;
    totalChunks: number;
    chunkSize: number;
    fileHash: string;
    thumbnail?: string;
    caption?: string;

    // State machine
    state: TransferState;
    phase: TransferPhase;
    direction: 'sending' | 'receiving';

    // Progress tracking (Store as simple numbers for efficiency, convert to Set in UI if needed)
    chunksProcessed: number; // For sender: Acked, For receiver: Received
    lastActivity: number;
    startedAt: number;

    // Internal tracking (Not shared with UI)
    pendingChunks: Set<number>;

    // File data
    tempPath?: string;
    filePath?: string;
    sanitizedPath?: string;
    isVaulting?: boolean;
    isVoiceNote?: boolean;

    // Adaptive congestion control state (sender only)
    windowSize?: number;
    ssthresh?: number;
    srtt?: number;
    rto?: number;
    consecutiveAcks?: number;
    nextChunkIndex?: number;
    _ackedChunks?: Set<number>;
    _chunksSentTimes?: Map<number, number>;
}

export interface TransferProgress {
    fileId: string;
    messageId?: string;
    upeerId: string;
    chatUpeerId?: string;
    progress: number;
    bytesTransferred: number;
    totalBytes: number;
    chunksTransferred: number;
    totalChunks: number;
    direction: 'sending' | 'receiving';
    state: TransferState;
    phase: TransferPhase;
    isVaulting?: boolean;
}

export interface TransferConfig {
    maxChunkSize: number;
    maxFileSize: number;
    transferTimeout: number;
    maxRetries: number;
    cleanupInterval: number;
    initialWindowSize: number;
    maxWindowSize: number;
}

export const DEFAULT_CONFIG: TransferConfig = {
    maxChunkSize: 1024 * 64,
    maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB
    transferTimeout: 300000,
    maxRetries: 5,
    cleanupInterval: 60000,
    initialWindowSize: 16,
    maxWindowSize: 128
};