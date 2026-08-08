import { describe, expect, it } from 'vitest';
import {
    validateFileProposal,
    validateFileAccept,
    validateFileChunk,
    validateFileChunkAck,
    validateFileDoneAck,
    validateFileCancel,
} from '../../../src/main_process/security/validationFiles.js';

describe('validationFiles', () => {
    describe('validateFileProposal', () => {
        const base = { fileId: 'f1', fileName: 'a.txt', fileSize: 1000, totalChunks: 10, chunkSize: 100 };

        it('acepta una propuesta válida', () => {
            expect(validateFileProposal(base).valid).toBe(true);
        });

        it('acepta archivo vacío con totalChunks=0', () => {
            expect(validateFileProposal({ fileId: 'f1', fileName: 'e', fileSize: 0, totalChunks: 0, chunkSize: 100 }).valid).toBe(true);
        });

        it('rechaza fileId, fileName, fileSize, totalChunks y chunkSize inválidos', () => {
            expect(validateFileProposal({ ...base, fileId: '' }).valid).toBe(false);
            expect(validateFileProposal({ ...base, fileName: 42 }).valid).toBe(false);
            expect(validateFileProposal({ ...base, fileSize: -1 }).valid).toBe(false);
            expect(validateFileProposal({ ...base, totalChunks: -1 }).valid).toBe(false);
            expect(validateFileProposal({ ...base, chunkSize: 0 }).valid).toBe(false);
        });

        it('rechaza inconsistencias entre fileSize y totalChunks', () => {
            expect(validateFileProposal({ fileId: 'f1', fileName: 'a', fileSize: 1000, totalChunks: 0, chunkSize: 100 }).valid).toBe(false);
            expect(validateFileProposal({ fileId: 'f1', fileName: 'a', fileSize: 1000, totalChunks: 9, chunkSize: 100 }).valid).toBe(false);
        });

        it('rechaza encryptedKey, encryptedKeyNonce, chatUpeerId y messageId inválidos', () => {
            expect(validateFileProposal({ ...base, encryptedKey: 'short' }).valid).toBe(false);
            expect(validateFileProposal({ ...base, encryptedKeyNonce: 'short' }).valid).toBe(false);
            expect(validateFileProposal({ ...base, chatUpeerId: 'plain' }).valid).toBe(false);
            expect(validateFileProposal({ ...base, messageId: 'x'.repeat(101) }).valid).toBe(false);
        });
    });

    describe('validateFileAccept / validateFileDoneAck / validateFileCancel', () => {
        it('acepta fileId válido', () => {
            expect(validateFileAccept({ fileId: 'f1' }).valid).toBe(true);
            expect(validateFileDoneAck({ fileId: 'f1' }).valid).toBe(true);
            expect(validateFileCancel({ fileId: 'f1' }).valid).toBe(true);
        });

        it('rechaza fileId inválido', () => {
            expect(validateFileAccept({ fileId: '' }).valid).toBe(false);
            expect(validateFileDoneAck({}).valid).toBe(false);
            expect(validateFileCancel({ fileId: 42 }).valid).toBe(false);
        });
    });

    describe('validateFileChunk', () => {
        const base64Chunk = Buffer.from('x'.repeat(1000)).toString('base64');

        it('acepta un chunk válido', () => {
            expect(validateFileChunk({ fileId: 'f1', chunkIndex: 0, data: base64Chunk }).valid).toBe(true);
        });

        it('rechaza fileId, chunkIndex y data inválidos', () => {
            expect(validateFileChunk({ chunkIndex: 0, data: base64Chunk }).valid).toBe(false);
            expect(validateFileChunk({ fileId: 'f1', chunkIndex: -1, data: base64Chunk }).valid).toBe(false);
            expect(validateFileChunk({ fileId: 'f1', chunkIndex: 0, data: '' }).valid).toBe(false);
        });

        it('rechaza data demasiado grande', () => {
            const big = Buffer.alloc(70 * 1024).toString('base64');
            expect(validateFileChunk({ fileId: 'f1', chunkIndex: 0, data: big }).valid).toBe(false);
        });

        it('rechaza chunkHash, iv y tag inválidos', () => {
            const valid = { fileId: 'f1', chunkIndex: 0, data: base64Chunk };
            expect(validateFileChunk({ ...valid, chunkHash: 'zz' }).valid).toBe(false);
            expect(validateFileChunk({ ...valid, iv: 'short' }).valid).toBe(false);
            expect(validateFileChunk({ ...valid, tag: 'short' }).valid).toBe(false);
        });
    });

    describe('validateFileChunkAck', () => {
        it('acepta fileId y chunkIndex válidos', () => {
            expect(validateFileChunkAck({ fileId: 'f1', chunkIndex: 3 }).valid).toBe(true);
        });

        it('rechaza campos inválidos', () => {
            expect(validateFileChunkAck({ fileId: '', chunkIndex: 3 }).valid).toBe(false);
            expect(validateFileChunkAck({ fileId: 'f1', chunkIndex: 'x' }).valid).toBe(false);
        });
    });
});
