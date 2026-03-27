import { DEFAULT_CONFIG } from '../network/file-transfer/types.js';
import type { ValidationResult } from './validationShared.js';

type FileProposalPayload = {
    fileId?: unknown;
    fileName?: unknown;
    fileSize?: unknown;
    totalChunks?: unknown;
    chunkSize?: unknown;
    encryptedKey?: unknown;
    encryptedKeyNonce?: unknown;
    chatUpeerId?: unknown;
    messageId?: unknown;
};

type FileAcceptPayload = {
    fileId?: unknown;
};

type FileChunkPayload = {
    fileId?: unknown;
    chunkIndex?: unknown;
    data?: unknown;
    chunkHash?: unknown;
    iv?: unknown;
    tag?: unknown;
};

type FileChunkAckPayload = {
    fileId?: unknown;
    chunkIndex?: unknown;
};

export function validateFileProposal(data: FileProposalPayload): ValidationResult {
    if (!data.fileId || typeof data.fileId !== 'string') return { valid: false, error: 'Invalid fileId' };
    if (!data.fileName || typeof data.fileName !== 'string') return { valid: false, error: 'Invalid fileName' };
    if (typeof data.fileSize !== 'number' || data.fileSize < 0) return { valid: false, error: 'Invalid fileSize' };
    if (typeof data.totalChunks !== 'number' || data.totalChunks <= 0) return { valid: false, error: 'Invalid totalChunks' };
    if (typeof data.chunkSize !== 'number' || data.chunkSize <= 0 || data.chunkSize > DEFAULT_CONFIG.maxChunkSize) {
        return { valid: false, error: 'Invalid chunkSize' };
    }
    if (Math.ceil(data.fileSize / data.chunkSize) !== data.totalChunks) {
        return { valid: false, error: 'Inconsistent totalChunks' };
    }
    if (data.encryptedKey !== undefined && (typeof data.encryptedKey !== 'string' || ![96, 160].includes(data.encryptedKey.length))) {
        return { valid: false, error: 'Invalid encryptedKey (expected 96 or 160 hex chars)' };
    }
    if (data.encryptedKeyNonce !== undefined && (typeof data.encryptedKeyNonce !== 'string' || data.encryptedKeyNonce.length !== 48)) {
        return { valid: false, error: 'Invalid encryptedKeyNonce (expected 48 hex chars)' };
    }
    if (data.chatUpeerId !== undefined && (
        typeof data.chatUpeerId !== 'string'
        || data.chatUpeerId.length > 128
        || !data.chatUpeerId.startsWith('grp-')
    )) {
        return { valid: false, error: 'Invalid chatUpeerId' };
    }
    if (data.messageId !== undefined && (typeof data.messageId !== 'string' || data.messageId.length > 100)) {
        return { valid: false, error: 'Invalid messageId' };
    }
    return { valid: true };
}

export function validateFileAccept(data: FileAcceptPayload): ValidationResult {
    if (!data.fileId || typeof data.fileId !== 'string') return { valid: false, error: 'Invalid fileId' };
    return { valid: true };
}

export function validateFileChunk(data: FileChunkPayload): ValidationResult {
    if (!data.fileId || typeof data.fileId !== 'string') return { valid: false, error: 'Invalid fileId' };
    if (typeof data.chunkIndex !== 'number' || data.chunkIndex < 0) return { valid: false, error: 'Invalid chunkIndex' };
    if (!data.data || typeof data.data !== 'string') return { valid: false, error: 'Invalid chunk data' };

    const maxChunkBytes = 64 * 1024;
    const maxEncodedLength = Math.ceil(maxChunkBytes / 3) * 4;
    if (data.data.length > maxEncodedLength) return { valid: false, error: 'Chunk data too large' };

    try {
        const chunkLength = Buffer.from(data.data, 'base64').length;
        if (chunkLength <= 0 || chunkLength > maxChunkBytes) {
            return { valid: false, error: 'Chunk data too large' };
        }
    } catch {
        return { valid: false, error: 'Invalid chunk data' };
    }

    if (data.chunkHash !== undefined && (typeof data.chunkHash !== 'string' || !/^[a-f0-9]{64}$/i.test(data.chunkHash))) {
        return { valid: false, error: 'Invalid chunkHash' };
    }
    if (data.iv !== undefined && (typeof data.iv !== 'string' || data.iv.length !== 24)) {
        return { valid: false, error: 'Invalid AES-GCM IV (expected 24 hex chars)' };
    }
    if (data.tag !== undefined && (typeof data.tag !== 'string' || data.tag.length !== 32)) {
        return { valid: false, error: 'Invalid AES-GCM tag (expected 32 hex chars)' };
    }
    return { valid: true };
}

export function validateFileChunkAck(data: FileChunkAckPayload): ValidationResult {
    if (!data.fileId || typeof data.fileId !== 'string') return { valid: false, error: 'Invalid fileId' };
    if (typeof data.chunkIndex !== 'number') return { valid: false, error: 'Invalid chunkIndex' };
    return { valid: true };
}

export function validateFileDoneAck(data: FileAcceptPayload): ValidationResult {
    if (!data.fileId || typeof data.fileId !== 'string') return { valid: false, error: 'Invalid fileId' };
    return { valid: true };
}

export function validateFileCancel(data: FileAcceptPayload): ValidationResult {
    if (!data.fileId || typeof data.fileId !== 'string') {
        return { valid: false, error: 'Invalid fileId' };
    }
    return { valid: true };
}
