export interface OpenFileDialogOptions {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
    multiSelect?: boolean;
}

export interface OpenFileDialogResponse {
    canceled: boolean;
    filePaths: string[];
}

export interface ReadFileAsBase64Request {
    filePath: string;
    maxSizeMB?: number;
}

export interface ReadFileAsBase64Response {
    success: boolean;
    data?: string;
    error?: string;
}

export interface GetPathForFileRequest {
    file: File;
}

export interface GetPathForFileResponse {
    path: string;
}

export interface StartFileTransferRequest {
    upeerId: string;
    filePath: string;
    thumbnail?: string;
    caption?: string;
    isVoiceNote?: boolean;
    fileName?: string;
}

export interface StartFileTransferResponse {
    success: boolean;
    fileId?: string;
    error?: string;
}

export interface CancelFileTransferRequest {
    fileId: string;
    reason?: string;
}

export interface CancelFileTransferResponse {
    success: boolean;
    error?: string;
}

export interface GetFileTransfersResponse {
    transfers: Array<{
        fileId: string;
        upeerId: string;
        fileName: string;
        fileSize: number;
        transferredBytes: number;
        status: 'pending' | 'transferring' | 'completed' | 'cancelled' | 'failed';
        direction: 'send' | 'receive';
        thumbnail?: string;
        startTime: string;
    }>;
}

export interface SaveTransferredFileRequest {
    fileId: string;
    destinationPath: string;
}

export interface SaveTransferredFileResponse {
    success: boolean;
    error?: string;
}

export interface GetNetworkStatsResponse {
    yggdrasilAddress: string;
    connectedPeers: number;
    bytesSent: number;
    bytesReceived: number;
    uptimeSeconds: number;
}

export interface RestartYggstackResponse {
    success: boolean;
    error?: string;
}

export interface ShowSaveDialogOptions {
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
}

export interface ShowSaveDialogResponse {
    canceled: boolean;
    filePath?: string;
}

export interface OpenFileRequest {
    filePath: string;
}

export interface OpenFileResponse {
    success: boolean;
    error?: string;
}
