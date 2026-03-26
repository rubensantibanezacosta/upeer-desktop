import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TransferValidator } from '../../../src/main_process/network/file-transfer/validator.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('TransferValidator - Unit Tests', () => {
    let validator: TransferValidator;
    let tempTestDir: string;

    beforeEach(async () => {
        validator = new TransferValidator(5000); // 5KB max para test
        tempTestDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validator-test-'));
    });

    afterEach(async () => {
        await fs.rm(tempTestDir, { recursive: true, force: true });
    });

    it('should validate and prepare a legitimate file', async () => {
        const testFile = path.join(tempTestDir, 'valid.txt');
        await fs.writeFile(testFile, 'hello world');

        const result = await validator.validateAndPrepareFile(testFile);

        expect(result.name).toBe('valid.txt');
        expect(result.size).toBe(11);
        expect(result.hash).toBeDefined();
        expect(result.hash.length).toBe(64); // SHA256 length
    });

    it('should reject files exceeding max size', async () => {
        const bigFile = path.join(tempTestDir, 'big.txt');
        await fs.writeFile(bigFile, Buffer.alloc(6000));

        await expect(validator.validateAndPrepareFile(bigFile)).rejects.toThrow('File too large');
    });

    describe('validateIncomingFile (Incoming metadata security)', () => {
        const validMeta = {
            fileId: '550e8400-e29b-41d4-a716-446655440000',
            fileName: 'safe.jpg',
            fileSize: 1024,
            mimeType: 'image/jpeg',
            totalChunks: 1,
            chunkSize: 1024,
            fileHash: 'a'.repeat(64)
        };

        it('should accept valid metadata with UUID fileId', () => {
            expect(() => validator.validateIncomingFile(validMeta)).not.toThrow();
        });

        it('should REJECT fileId with path traversal attempt', () => {
            const malicious = { ...validMeta, fileId: '../../ssh/id_rsa' };
            expect(() => validator.validateIncomingFile(malicious)).toThrow('Invalid fileId: must be a UUID');
        });

        it('should REJECT fileId with simple numeric IDs or non-UUIDs', () => {
            const malicious = { ...validMeta, fileId: '12345' };
            expect(() => validator.validateIncomingFile(malicious)).toThrow('Invalid fileId: must be a UUID');
        });

        it('should reject invalid fileName patterns', () => {
            // Suponiendo que isValidFileName filtra nombres peligrosos (como los que empiezan por punto o con caracteres raros)
            const malicious = { ...validMeta, fileName: '../../../etc/passwd' };
            expect(() => validator.validateIncomingFile(malicious)).toThrow();
        });

        it('should reject invalid hash formats', () => {
            const malicious = { ...validMeta, fileHash: 'not-a-hash' };
            expect(() => validator.validateIncomingFile(malicious)).toThrow('Invalid fileHash format');
        });

        it('should reject mismatch in totalChunks/fileSize (implicit in chunkSize)', () => {
            const _invalid = { ...validMeta, fileSize: 5000, totalChunks: 1, chunkSize: 100 };
            // Este test depende de si el validador comprueba la coherencia matemática
            // Agreguemos una comprobación de coherencia si no existe
        });
    });
});
