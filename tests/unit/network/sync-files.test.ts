import { describe, expect, it } from 'vitest';

import { chunkBounds, chunkCount } from '../../../src/main_process/network/sync/files/chunks.js';
import { validateMessage } from '../../../src/main_process/security/validation.js';
import {
    FILE_CHUNK_SIZE,
    isSyncFileType,
    parseFileChunk,
    parseFileRequest,
    parseFileResponse,
} from '../../../src/main_process/network/sync/files/packets.js';

describe('tramos de un adjunto sincronizado', () => {
    it('reparte el tamaño en tramos del tamaño fijado', () => {
        expect(chunkCount(0, FILE_CHUNK_SIZE)).toBe(0);
        expect(chunkCount(1, FILE_CHUNK_SIZE)).toBe(1);
        expect(chunkCount(FILE_CHUNK_SIZE, FILE_CHUNK_SIZE)).toBe(1);
        expect(chunkCount(FILE_CHUNK_SIZE + 1, FILE_CHUNK_SIZE)).toBe(2);
        expect(chunkCount(8 * 1024 * 1024, FILE_CHUNK_SIZE)).toBe(Math.ceil((8 * 1024 * 1024) / FILE_CHUNK_SIZE));
    });

    it('calcula el inicio y la longitud de cada tramo', () => {
        expect(chunkBounds(0, 10, 25)).toEqual({ start: 0, length: 10 });
        expect(chunkBounds(2, 10, 25)).toEqual({ start: 20, length: 5 });
        expect(chunkBounds(3, 10, 25)).toBeNull();
        expect(chunkBounds(-1, 10, 25)).toBeNull();
    });
});

describe('paquetes de fichero del enlace de sincronización', () => {
    it('reconoce solo los tres tipos del canal', () => {
        expect(isSyncFileType('SYNC_FILE_REQ')).toBe(true);
        expect(isSyncFileType('SYNC_FILE_RES')).toBe(true);
        expect(isSyncFileType('SYNC_FILE_CHUNK')).toBe(true);
        expect(isSyncFileType('SYNC_ENVELOPE')).toBe(false);
    });

    it('valida la petición', () => {
        expect(parseFileRequest({ requestId: 'abc12345', fileId: '550e8400-e29b-41d4-a716-446655440000' }))
            .toEqual({ requestId: 'abc12345', fileId: '550e8400-e29b-41d4-a716-446655440000' });
        expect(parseFileRequest({ requestId: 'corto', fileId: 'x' })).toBeNull();
        expect(parseFileRequest({ requestId: 'abc12345', fileId: '' })).toBeNull();
        expect(parseFileRequest({ requestId: 'abc12345', fileId: '../secreto' })).toBeNull();
        expect(parseFileRequest({})).toBeNull();
    });

    it('exige metadatos completos en una respuesta correcta', () => {
        const base = { requestId: 'abc12345', fileId: 'f1', ok: true, fileName: 'foto.png', fileSize: 100, chunkSize: 10, totalChunks: 10 };
        expect(parseFileResponse(base)).toMatchObject({ ok: true, fileName: 'foto.png', totalChunks: 10 });
        expect(parseFileResponse({ ...base, totalChunks: 0 })).toBeNull();
        expect(parseFileResponse({ ...base, fileSize: -1 })).toBeNull();
        expect(parseFileResponse({ ...base, fileName: '' })).toBeNull();
    });

    it('acepta una negativa sin metadatos', () => {
        expect(parseFileResponse({ requestId: 'abc12345', fileId: 'f1', ok: false, reason: 'not-here' }))
            .toEqual({ requestId: 'abc12345', fileId: 'f1', ok: false, reason: 'not-here' });
        expect(parseFileResponse({ requestId: 'abc12345', fileId: 'f1', ok: false }))
            .toMatchObject({ ok: false, reason: 'unavailable' });
    });

    it('valida los tramos', () => {
        expect(parseFileChunk({ requestId: 'abc12345', index: 0, data: 'AAAA' }))
            .toEqual({ requestId: 'abc12345', index: 0, data: 'AAAA' });
        expect(parseFileChunk({ requestId: 'abc12345', index: -1, data: 'AAAA' })).toBeNull();
        expect(parseFileChunk({ requestId: 'abc12345', index: 1.5, data: 'AAAA' })).toBeNull();
        expect(parseFileChunk({ requestId: 'abc12345', index: 0, data: '' })).toBeNull();
        expect(parseFileChunk({ requestId: 'abc12345', index: 0, data: 'abc' })).toBeNull();
        expect(parseFileChunk({ requestId: 'abc12345', index: 0, data: 'zz' })).toBeNull();
        expect(parseFileChunk({ requestId: 'abc12345', index: 0 })).toBeNull();
    });
});

describe('admisión de los paquetes del canal de adjuntos', () => {
    const certificate = {
        deviceId: 'a'.repeat(64),
        devicePublicKey: 'b'.repeat(64),
        signature: 'firma',
        accountUpeerId: 'c'.repeat(64),
    };
    const base = {
        senderDeviceId: certificate.deviceId,
        senderDeviceCertificate: certificate,
        recipientDeviceId: 'd'.repeat(64),
        content: 'contenido',
        nonce: 'nonce',
        ratchetHeader: { dh: 'e'.repeat(64), pn: 0, n: 1 },
    };

    it('acepta los tres tipos con un sobre cifrado completo', () => {
        for (const type of ['SYNC_FILE_REQ', 'SYNC_FILE_RES', 'SYNC_FILE_CHUNK']) {
            expect(validateMessage(type, base)).toEqual({ valid: true });
        }
    });

    it('rechaza el paquete sin cabecera de ratchet', () => {
        expect(validateMessage('SYNC_FILE_REQ', { ...base, ratchetHeader: undefined }).valid).toBe(false);
    });

    it('rechaza el paquete sin destinatario', () => {
        expect(validateMessage('SYNC_FILE_RES', { ...base, recipientDeviceId: undefined }).valid).toBe(false);
    });
});
