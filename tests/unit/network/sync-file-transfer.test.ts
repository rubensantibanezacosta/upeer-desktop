import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    appPath: '',
    stored: null as { messageId: string; savedPath: string; fileName: string; fileSize: number } | null,
    persisted: [] as { messageId: string; savedPath: string }[],
    notified: [] as { messageId: string; fileId: string; savedPath: string }[],
    sent: [] as { type: string; payload: Record<string, unknown> }[],
}));

vi.mock('electron', () => ({
    app: { getPath: () => mocks.appPath },
}));

vi.mock('../../../src/main_process/network/sync/transport.js', () => ({
    sendEncryptedSync: async (_peer: unknown, type: string, payload: Record<string, unknown>) => {
        mocks.sent.push({ type, payload });
        return true;
    },
}));

vi.mock('../../../src/main_process/network/sync/files/storage.js', () => ({
    findStoredFile: () => mocks.stored,
    persistSavedPath: (messageId: string, savedPath: string) => {
        mocks.persisted.push({ messageId, savedPath });
        return true;
    },
    notifyFileReceived: (win: unknown, messageId: string, fileId: string, savedPath: string) => {
        mocks.notified.push({ messageId, fileId, savedPath });
    },
}));

const { serveSyncFile } = await import('../../../src/main_process/network/sync/files/responder.js');
const { openSyncFileReceipt, writeSyncFileChunk, receivedFilePath } = await import('../../../src/main_process/network/sync/files/receiver.js');
const { FILE_CHUNK, FILE_CHUNK_SIZE, FILE_RES } = await import('../../../src/main_process/network/sync/files/packets.js');

const peer = { deviceId: 'a'.repeat(64), address: '200::1', devicePublicKey: 'b'.repeat(64), certificate: {}, signedPreKey: {}, lastSeen: 0 } as never;
const source = Buffer.alloc(FILE_CHUNK_SIZE * 2 + 137);
for (let index = 0; index < source.length; index += 1) source[index] = index % 251;

let workDir = '';
let savedPath = '';

describe('ida y vuelta de un adjunto por el enlace de sincronización', () => {
    beforeAll(async () => {
        workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'upeer-sync-file-'));
        mocks.appPath = workDir;
        savedPath = path.join(workDir, 'origen.png');
        await fs.promises.writeFile(savedPath, source);
        mocks.stored = { messageId: 'msg-1', savedPath, fileName: 'origen.png', fileSize: source.length };
    });

    afterAll(async () => {
        await fs.promises.rm(workDir, { recursive: true, force: true });
    });

    it('sirve los tramos, los recibe, los reensambla y guarda la ruta en el mensaje', async () => {
        const served = await serveSyncFile(peer, { requestId: 'req12345678', fileId: 'file-1' });
        expect(served).toBe(true);

        const [response, ...chunks] = mocks.sent;
        expect(response.type).toBe(FILE_RES);
        expect(response.payload).toMatchObject({
            requestId: 'req12345678',
            fileId: 'file-1',
            ok: true,
            fileName: 'origen.png',
            fileSize: source.length,
            chunkSize: FILE_CHUNK_SIZE,
            totalChunks: 3,
        });
        expect(chunks).toHaveLength(3);
        expect(chunks.every((entry) => entry.type === FILE_CHUNK)).toBe(true);
        expect(chunks.map((entry) => entry.payload.index)).toEqual([0, 1, 2]);

        expect(await openSyncFileReceipt({
            requestId: 'req12345678',
            fileId: 'file-1',
            ok: true,
            fileName: 'origen.png',
            fileSize: source.length,
            chunkSize: FILE_CHUNK_SIZE,
            totalChunks: 3,
        })).toBe(true);

        const completed = [];
        for (const chunk of chunks) {
            completed.push(await writeSyncFileChunk({ requestId: 'req12345678', index: chunk.payload.index as number, data: chunk.payload.data as string }, null));
        }
        expect(completed).toEqual([null, null, 'file-1']);

        const written = await fs.promises.readFile(receivedFilePath('file-1', 'origen.png'));
        expect(written.equals(source)).toBe(true);
        expect(mocks.persisted).toEqual([{ messageId: 'msg-1', savedPath: receivedFilePath('file-1', 'origen.png') }]);
        expect(mocks.notified).toEqual([
            { messageId: 'msg-1', fileId: 'file-1', savedPath: receivedFilePath('file-1', 'origen.png') },
        ]);
    });

    it('descarta la recepción cuando un tramo llega fuera de orden', async () => {
        mocks.sent.length = 0;
        await serveSyncFile(peer, { requestId: 'req87654321', fileId: 'file-2' });
        const [, ...chunks] = mocks.sent;
        await openSyncFileReceipt({
            requestId: 'req87654321',
            fileId: 'file-2',
            ok: true,
            fileName: 'origen.png',
            fileSize: source.length,
            chunkSize: FILE_CHUNK_SIZE,
            totalChunks: 3,
        });
        const outcome = await writeSyncFileChunk({ requestId: 'req87654321', index: 2, data: chunks[2].payload.data as string }, null);
        expect(outcome).toBeNull();
        await expect(fs.promises.readFile(receivedFilePath('file-2', 'origen.png'))).rejects.toThrow();
    });
});
