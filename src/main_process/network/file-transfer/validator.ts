import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FileTransfer } from './types.js';

export interface FileValidationResult {
    name: string;
    size: number;
    mimeType: string;
    hash: string;
}

export class TransferValidator {
    private maxFileSize: number;

    constructor(maxFileSize: number = 100 * 1024 * 1024) {
        this.maxFileSize = maxFileSize;
    }

    async validateAndPrepareFile(filePath: string): Promise<FileValidationResult> {
        // Check file exists
        await fs.access(filePath);

        // Get file stats
        const stats = await fs.stat(filePath);

        // Validate file size
        if (stats.size > this.maxFileSize) {
            throw new Error(`File too large: ${stats.size} bytes (max: ${this.maxFileSize} bytes)`);
        }

        const fileName = path.basename(filePath);
        const mimeType = this.detectMimeType(fileName);

        // Calculate file hash using streaming to avoid memory issues
        const fileHash = await this.calculateFileHash(filePath);

        return {
            name: fileName,
            size: stats.size,
            mimeType,
            hash: fileHash
        };
    }

    private async calculateFileHash(filePath: string): Promise<string> {
        const { createReadStream } = await import('node:fs');
        const hash = crypto.createHash('sha256');
        const stream = createReadStream(filePath);

        return new Promise((resolve, reject) => {
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', (err) => reject(err));
        });
    }

    validateIncomingFile(data: any): void {
        // Required fields check
        const requiredFields = ['fileId', 'fileName', 'fileSize', 'mimeType', 'totalChunks', 'fileHash', 'chunkSize'];
        for (const field of requiredFields) {
            if (data[field] === undefined || data[field] === null) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // BUG CK fix: validar que fileId sea un UUID estándar.
        // chunker.createTempFile() usa fileId como nombre de archivo en un directorio
        // temporal: `path.join(tempDir, fileId)`. Sin esta validación, un peer malicioso
        // puede enviar fileId='../../../home/user/.ssh/authorized_keys' y path.join
        // resuelve los '..' → path traversal: el archivo temporal se crea en una ruta
        // arbitraria del sistema de archivos del usuario.
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!UUID_REGEX.test(String(data.fileId))) {
            throw new Error('Invalid fileId: must be a UUID');
        }

        // Type validation
        if (typeof data.fileSize !== 'number' || data.fileSize <= 0) {
            throw new Error('Invalid fileSize');
        }

        if (data.fileSize > this.maxFileSize) {
            throw new Error(`File size exceeds limit: ${data.fileSize} > ${this.maxFileSize}`);
        }

        if (typeof data.totalChunks !== 'number' || data.totalChunks <= 0) {
            throw new Error('Invalid totalChunks');
        }

        if (typeof data.chunkSize !== 'number' || data.chunkSize <= 0) {
            throw new Error('Invalid chunkSize');
        }

        if (typeof data.fileHash !== 'string' || !/^[a-f0-9]{64}$/i.test(data.fileHash)) {
            throw new Error('Invalid fileHash format');
        }

        // Validate file name for safety
        if (!this.isValidFileName(data.fileName)) {
            throw new Error('Invalid file name');
        }

        // Validate MIME type
        if (!this.isValidMimeType(data.mimeType)) {
            throw new Error('Invalid MIME type');
        }
    }

    async verifyFileHash(transfer: FileTransfer, expectedHash: string): Promise<void> {
        if (!transfer.tempPath) {
            throw new Error('No temp file to verify');
        }

        const actualHash = await this.calculateFileHash(transfer.tempPath);

        if (actualHash !== expectedHash) {
            throw new Error(`File hash mismatch: expected ${expectedHash.substring(0, 16)}..., got ${actualHash.substring(0, 16)}...`);
        }
    }

    validateChunkData(transfer: FileTransfer, chunkData: any): void {
        if (chunkData.fileId !== transfer.fileId) {
            throw new Error('File ID mismatch');
        }

        if (chunkData.chunkIndex < 0 || chunkData.chunkIndex >= transfer.totalChunks) {
            throw new Error(`Invalid chunk index: ${chunkData.chunkIndex}`);
        }

        if (chunkData.totalChunks !== transfer.totalChunks) {
            throw new Error('Total chunks mismatch');
        }

        if (!chunkData.data || typeof chunkData.data !== 'string') {
            throw new Error('Invalid chunk data');
        }

        if (!chunkData.chunkHash || typeof chunkData.chunkHash !== 'string') {
            throw new Error('Invalid chunk hash');
        }
    }

    private detectMimeType(fileName: string): string {
        const ext = path.extname(fileName).toLowerCase();
        const mimeMap: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.txt': 'text/plain',
            '.pdf': 'application/pdf',
            '.zip': 'application/zip',
            '.mp3': 'audio/mpeg',
            '.mp4': 'video/mp4',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt': 'application/vnd.ms-powerpoint',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        };
        return mimeMap[ext] || 'application/octet-stream';
    }

    private isValidFileName(fileName: string): boolean {
        // Basic validation: no directory traversal, reasonable length
        if (!fileName || fileName.length > 255) return false;
        if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) return false;

        // Check for dangerous characters
        const dangerousChars = ['<', '>', ':', '"', '|', '?', '*'];
        for (const char of dangerousChars) {
            if (fileName.includes(char)) return false;
        }

        return true;
    }

    private isValidMimeType(mimeType: string): boolean {
        // Basic MIME type validation
        if (!mimeType || typeof mimeType !== 'string') return false;

        // Should have format type/subtype
        const parts = mimeType.split('/');
        if (parts.length !== 2) return false;

        const [type, subtype] = parts;
        if (!type || !subtype) return false;

        // Allow common MIME types
        const allowedTypes = [
            'application', 'audio', 'image', 'text', 'video',
            'font', 'model', 'example', 'message', 'multipart'
        ];

        if (!allowedTypes.includes(type)) return false;

        // Subtype should not contain spaces or special chars
        if (!/^[a-z0-9.+*-]+$/i.test(subtype)) return false;

        return true;
    }

    getMaxFileSize(): number {
        return this.maxFileSize;
    }

    setMaxFileSize(size: number): void {
        if (size <= 0) {
            throw new Error('Max file size must be positive');
        }
        this.maxFileSize = size;
    }
}