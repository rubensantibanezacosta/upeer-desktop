import { beforeEach, describe, expect, it, vi } from 'vitest';

const listSyncPeers = vi.fn();
const getFileHistory = vi.fn();
const requestSyncFile = vi.fn();
const fileIsLocal = vi.fn();
const isSyncFilePending = vi.fn();
const completeSyncFileRequest = vi.fn();

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: () => 'a'.repeat(64),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    debug: vi.fn(),
    warn: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/sync/peers.js', () => ({
    listSyncPeers: (...args: unknown[]) => listSyncPeers(...args),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    getFileHistory: (...args: unknown[]) => getFileHistory(...args),
}));

vi.mock('../../../src/main_process/network/sync/files/request.js', () => ({
    requestSyncFile: (...args: unknown[]) => requestSyncFile(...args),
    fileIsLocal: (...args: unknown[]) => fileIsLocal(...args),
    isSyncFilePending: (...args: unknown[]) => isSyncFilePending(...args),
    completeSyncFileRequest: (...args: unknown[]) => completeSyncFileRequest(...args),
    pendingFileRequestId: () => 'req-f1',
}));

vi.mock('../../../src/main_process/network/sync/files/receiver.js', () => ({
    fileReceiptProgress: () => receiptProgress,
}));

import {
    getSyncFileWork,
    refreshSyncFileProgress,
    resetSyncFileWork,
    sweepMissingFiles,
} from '../../../src/main_process/network/sync/files/autofetch.js';

let receiptProgress: number | null = null;

const entry = (fileId: string, savedPath?: string) => ({ fileId, savedPath });

describe('autodescarga de adjuntos sincronizados', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetSyncFileWork();
        receiptProgress = null;
        listSyncPeers.mockReturnValue([{ deviceId: 'b'.repeat(64), address: '200::1' }]);
        getFileHistory.mockReturnValue([]);
        fileIsLocal.mockReturnValue(false);
        isSyncFilePending.mockReturnValue(false);
        requestSyncFile.mockResolvedValue({ requested: 1, local: false });
    });

    it('no pide nada si no hay otros dispositivos propios', async () => {
        listSyncPeers.mockReturnValue([]);
        getFileHistory.mockReturnValue([entry('f1')]);

        const work = await sweepMissingFiles();

        expect(work.total).toBe(0);
        expect(requestSyncFile).not.toHaveBeenCalled();
    });

    it('pide el adjunto que no está en este equipo', async () => {
        getFileHistory.mockReturnValue([entry('f1')]);

        const work = await sweepMissingFiles();

        expect(requestSyncFile).toHaveBeenCalledWith('f1', null);
        expect(work).toEqual({ total: 1, done: 0, pending: 1, failed: 0, progressUnits: 0 });
    });

    it('deja fuera del recuento lo que ya estaba descargado', async () => {
        getFileHistory.mockReturnValue([entry('f1')]);
        fileIsLocal.mockReturnValue(true);

        const work = await sweepMissingFiles();

        expect(requestSyncFile).not.toHaveBeenCalled();
        expect(work).toEqual({ total: 0, done: 0, pending: 0, failed: 0, progressUnits: 0 });
    });

    it('cuenta como descargado el adjunto con savedPath en disco', async () => {
        getFileHistory.mockReturnValue([entry('f1', '/tmp/no-existe-upeer.png')]);
        requestSyncFile.mockResolvedValue({ requested: 0, local: true });

        const work = await sweepMissingFiles();

        expect(work.done).toBe(1);
    });

    it('marca como fallido el adjunto que ningún dispositivo sirve', async () => {
        getFileHistory.mockReturnValue([entry('f1')]);
        requestSyncFile.mockResolvedValue({ requested: 0, local: false });

        const work = await sweepMissingFiles();

        expect(work).toEqual({ total: 1, done: 0, pending: 0, failed: 1, progressUnits: 0 });
    });

    it('cuenta una sola vez un adjunto repetido en varios mensajes', async () => {
        getFileHistory.mockReturnValue([entry('f1'), entry('f1')]);

        const work = await sweepMissingFiles();

        expect(requestSyncFile).toHaveBeenCalledTimes(1);
        expect(work.total).toBe(1);
    });

    it('publica el avance para que la barra lo muestre', async () => {
        getFileHistory.mockReturnValue([entry('f1'), entry('f2')]);
        fileIsLocal.mockReturnValueOnce(true).mockReturnValue(false);

        await sweepMissingFiles();

        expect(getSyncFileWork()).toEqual({ total: 1, done: 0, pending: 1, failed: 0, progressUnits: 0 });
    });

    it('suma al avance el adjunto que se termina de traer', async () => {
        getFileHistory.mockReturnValue([entry('f1'), entry('f2')]);
        fileIsLocal.mockReturnValueOnce(true).mockReturnValue(false);
        await sweepMissingFiles();

        fileIsLocal.mockReturnValue(true);
        const work = await sweepMissingFiles();

        expect(work).toEqual({ total: 1, done: 1, pending: 0, failed: 0, progressUnits: 1 });
    });

    it('mueve la barra con los tramos que ya llegaron del adjunto en curso', async () => {
        getFileHistory.mockReturnValue([entry('f1')]);
        await sweepMissingFiles();

        receiptProgress = 0.5;
        const work = refreshSyncFileProgress();

        expect(work.done).toBe(0);
        expect(work.progressUnits).toBeCloseTo(0.5, 5);
        expect(requestSyncFile).toHaveBeenCalledTimes(1);
    });

    it('el refresco rápido no vuelve a pedir el adjunto', async () => {
        getFileHistory.mockReturnValue([entry('f1')]);
        await sweepMissingFiles();

        refreshSyncFileProgress();
        refreshSyncFileProgress();

        expect(requestSyncFile).toHaveBeenCalledTimes(1);
    });
});
