import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransferManager } from '../../../src/main_process/network/file-transfer/transfer-manager.js';
import { TransferPhase } from '../../../src/main_process/network/file-transfer/types.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations.js';

// Mock node:fs y node:path antes de los otros mocks que puedan importarlos
vi.mock('node:fs/promises', () => ({
    open: vi.fn().mockResolvedValue({
        read: vi.fn().mockResolvedValue({ bytesRead: 50 }),
        write: vi.fn().mockResolvedValue({ bytesWritten: 1024 }),
        close: vi.fn().mockResolvedValue(undefined),
    }),
}));

vi.mock('node:path', () => ({
    default: {
        join: (...args: string[]) => args.join('/'),
        extname: (p: string) => p.slice(p.lastIndexOf('.')),
        basename: (p: string) => p.split('/').pop()?.split('\\').pop() ?? '',
    },
    join: (...args: string[]) => args.join('/'),
    extname: (p: string) => p.slice(p.lastIndexOf('.')),
    basename: (p: string) => p.split('/').pop()?.split('\\').pop() ?? '',
}));

vi.mock('node:os', () => ({
    default: { tmpdir: () => '/tmp' },
    tmpdir: () => '/tmp',
}));

// Mocks de dependencias
vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'my-upeer-id'),
    encrypt: vi.fn(() => ({ ciphertext: 'ciphertext', nonce: 'nonce' })),
    decrypt: vi.fn(() => Buffer.from('decrypted')),
    sign: vi.fn(() => Buffer.from('signature')),
    verify: vi.fn(() => true),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveFileMessage: vi.fn(),
    updateMessageStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/network/file-transfer/metadata-sanitizer.js', () => ({
    metadataSanitizer: {
        canSanitize: vi.fn(() => false),
        sanitizeFile: vi.fn(async (path: string) => ({
            sanitizedPath: path,
            originalPath: path,
            wasProcessed: false,
            metadataRemoved: []
        })),
        cleanup: vi.fn().mockResolvedValue(undefined),
        cleanupAll: vi.fn().mockResolvedValue(undefined),
    }
}));

vi.mock('../../../src/main_process/network/file-transfer/validator.js', () => {
    return {
        TransferValidator: class {
            validateAndPrepareFile = vi.fn(async (_path) => ({
                name: 'test.jpg',
                size: 1024,
                mimeType: 'image/jpeg',
                hash: 'hash123'
            }));
            detectMimeType = vi.fn(() => 'image/jpeg');
            validateIncomingFile = vi.fn();
            verifyFileHash = vi.fn().mockResolvedValue(true);
        }
    };
});

vi.mock('../../../src/main_process/network/file-transfer/chunker.js', () => ({
    FileChunker: class {
        calculateChunks = vi.fn(() => 1);
        createTempFile = vi.fn().mockResolvedValue(true);
        cleanupTempFile = vi.fn().mockResolvedValue(true);
        createChunkData = vi.fn().mockResolvedValue({ data: Buffer.from('chunk-data').toString('base64'), chunkIndex: 0 });
    }
}));

describe('TransferManager - Core Orchestration', () => {
    let manager: any;
    const mockSend = vi.fn();
    const mockWin = {
        isDestroyed: vi.fn(() => false),
        webContents: {
            send: vi.fn(),
            isDestroyed: vi.fn(() => false)
        }
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
        manager = new TransferManager();
        manager.initialize((...args: any[]) => mockSend(...args), mockWin);
    });

    it('should orchestrate a new file proposal (startSend)', async () => {
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({
            upeerId: 'peer-1',
            publicKey: 'a'.repeat(64),
            status: 'connected'
        });

        const fileId = await manager.startSend('peer-1', 'ygg-address', '/test/file.jpg');

        expect(fileId).toBeDefined();
        await new Promise(r => setTimeout(r, 50)); expect(mockSend).toHaveBeenCalledWith(
            'ygg-address',
            expect.objectContaining({
                type: 'FILE_PROPOSAL',
                fileName: 'file.jpg'
            }),
            expect.any(String)
        );

        const transfer = manager['store'].getTransfer(fileId, 'sending');
        expect(transfer?.phase).toBe(TransferPhase.PROPOSED);
    });

    it('should retry proposal if no acceptance is received', async () => {
        vi.useFakeTimers();
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'peer-1', status: 'connected' });

        await manager.startSend('peer-1', 'ygg-addr', '/path');
        expect(mockSend).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(1100);
        expect(mockSend).toHaveBeenCalledTimes(2);

        vi.useRealTimers();
    });

    it('should handle cancelation and clean up', async () => {
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p1' });
        const fileId = await manager.startSend('p1', 'addr', '/path');

        await manager.cancelTransfer(fileId, 'user-canceled');

        const transfer = manager['store'].getTransfer(fileId, 'sending');
        expect(transfer?.state).toBe('cancelled');
    });

    it('should handle incoming FILE_PROPOSAL and respond with ACCEPT', async () => {
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'sender', publicKey: 'b'.repeat(64) });
        const proposal = { type: 'FILE_PROPOSAL', fileId: 'id1', fileName: 'f.txt', signature: 'sig' };

        await manager.handleMessage('sender', 'addr', proposal);
        await manager.acceptTransfer('id1');

        await new Promise(r => setTimeout(r, 50)); expect(mockSend).toHaveBeenCalledWith('addr', expect.objectContaining({ type: 'FILE_ACCEPT' }), 'b'.repeat(64));
    });

    it('should handle FILE_CHUNK and send ACK', async () => {
        const fileId = 'id-chunk';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p2' });

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p2', peerAddress: 'addr2', totalChunks: 2, chunkSize: 1024, direction: 'receiving'
        });
        manager['store'].updateTransfer(fileId, 'receiving', { state: 'active', phase: TransferPhase.READY });

        await manager.handleMessage('p2', 'addr2', { type: 'FILE_CHUNK', fileId, chunkIndex: 0, data: 'AAAA' });

        await new Promise(r => setTimeout(r, 50)); expect(mockSend).toHaveBeenCalledWith('addr2', expect.objectContaining({ type: 'FILE_ACK' }), undefined);
    });

    it('should complete receiver when all chunks arrive', async () => {
        const fileId = 'id-done';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p3' });
        // Mock simple de la validación de hash
        manager['validator'].verifyFileHash = vi.fn().mockResolvedValue(true);

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p3', peerAddress: 'addr3', totalChunks: 1, chunkSize: 1024, direction: 'receiving', fileHash: 'h',
            tempPath: '/tmp/test.tmp'
        });
        manager['store'].updateTransfer(fileId, 'receiving', { state: 'active', phase: TransferPhase.TRANSFERRING });

        await manager.handleMessage('p3', 'addr3', { type: 'FILE_CHUNK', fileId, chunkIndex: 0, data: 'AAAA' });

        const updated = manager['store'].getTransfer(fileId, 'receiving');
        expect(updated?.state).toBe('completed');

        // Verificamos que se envió FILE_ACK
        await new Promise(r => setTimeout(r, 50)); expect(mockSend).toHaveBeenCalledWith('addr3', expect.objectContaining({ type: 'FILE_ACK' }), undefined);
    });

    it('should handle hash mismatch and cancel transfer', async () => {
        const fileId = 'id-fail';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p4', publicKey: 'k' });

        (manager['validator'].verifyFileHash as any).mockRejectedValue(new Error('bad hash'));

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p4', peerAddress: 'addr4',
            fileName: 'f.txt', fileSize: 100, mimeType: 'text/plain',
            totalChunks: 1, chunkSize: 100,
            direction: 'receiving', fileHash: 'h'
        });

        manager['store'].updateTransfer(fileId, 'receiving', {
            state: 'active',
            phase: TransferPhase.TRANSFERRING,
            tempPath: 'p'
        });

        // Usamos finalizeTransfer que es lo que llama handleFileChunk al terminar
        await manager.finalizeTransfer(fileId, 'receiving');

        const updatedTransfer = manager['store'].getTransfer(fileId, 'receiving');
        expect(updatedTransfer?.state).toBe('cancelled');
        await new Promise(r => setTimeout(r, 50)); expect(mockSend).toHaveBeenCalledWith('addr4', expect.objectContaining({ type: 'FILE_CANCEL' }), 'k');
    });

    it('should handle FILE_ACCEPT and start sending chunks', async () => {
        const fileId = 'id-send';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({
            upeerId: 'p5',
            publicKey: 'kp5'
        });

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p5', peerAddress: 'addr5',
            fileName: 'f.txt', fileSize: 200, mimeType: 'text/plain',
            totalChunks: 2, chunkSize: 100, fileHash: 'h',
            direction: 'sending', filePath: '/path'
        });
        manager['store'].updateTransfer(fileId, 'sending', {
            state: 'active',
            phase: TransferPhase.PROPOSED,
            nextChunkIndex: 0,
            windowSize: 64,
            chunksProcessed: 0
        });

        // Simulamos un mensaje con firma válida para handleAccept
        const handlePromise = manager.handleMessage('p5', 'addr5', {
            type: 'FILE_ACCEPT',
            fileId,
            signature: 'validsig'
        });

        // El estado real se mantiene en el store, y handleAccept actualiza la fase a TRANSFERRING

        // expect(transfer?.phase).toBe(TransferPhase.TRANSFERRING);
        // Debe haber intentado enviar al menos un chunk
        await handlePromise;
        // Esperar un pelín por las promesas internas de sendNextChunks
        await new Promise(r => setTimeout(r, 10));
        expect(mockSend).toHaveBeenCalledWith('addr5', expect.objectContaining({ type: 'FILE_CHUNK' }), 'kp5');
    });

    it('should update window size on FILE_CHUNK_ACK', async () => {
        const fileId = 'id-ack';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p6' });

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p6', peerAddress: 'addr6',
            totalChunks: 10, direction: 'sending', windowSize: 10
        });
        manager['store'].updateTransfer(fileId, 'sending', { state: 'active', phase: TransferPhase.TRANSFERRING });

        await manager.handleMessage('p6', 'addr6', { type: 'FILE_CHUNK_ACK', fileId, chunkIndex: 0 });

        const transfer = manager['store'].getTransfer(fileId, 'sending');
        expect(transfer?.windowSize).toBeGreaterThan(10);
    });

    it('should complete sender on FILE_DONE_ACK', async () => {
        const fileId = 'id-done-ack';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p7' });

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p7', peerAddress: 'addr7',
            totalChunks: 1, direction: 'sending'
        });
        manager['store'].updateTransfer(fileId, 'sending', { state: 'active', phase: TransferPhase.TRANSFERRING });

        await manager.handleMessage('p7', 'addr7', { type: 'FILE_DONE_ACK', fileId });

        const transfer = manager['store'].getTransfer(fileId, 'sending');
        expect(transfer?.state).toBe('completed');
    });

    it('should handle vault accept and start sending chunks', async () => {
        const fileId = 'id-vault-accept';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p8', publicKey: 'kp8' });

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p8', peerAddress: 'addr8',
            totalChunks: 2, direction: 'sending',
            nextChunkIndex: 0,
            windowSize: 64,
            chunksProcessed: 0,
            state: 'active',
            filePath: '/path'
        });
        // Simulamos que está en fase VAULTED
        manager['store'].updateTransfer(fileId, 'sending', { phase: TransferPhase.VAULTED });

        await manager.handleMessage('p8', 'addr8', {
            type: 'FILE_ACCEPT',
            fileId,
            signature: 'sig-v'
        });

        // expect(transfer?.phase).toBe(TransferPhase.TRANSFERRING);
        await new Promise(r => setTimeout(r, 50));
        expect(mockSend).toHaveBeenCalledWith('addr8', expect.objectContaining({ type: 'FILE_CHUNK' }), 'kp8');
    });

    it('should ignore duplicate sequence (chunks already processed)', async () => {
        const fileId = 'id-dupe';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p9' });

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p9', peerAddress: 'addr9', totalChunks: 10, direction: 'receiving'
        });
        manager['store'].updateTransfer(fileId, 'receiving', { state: 'active', phase: TransferPhase.TRANSFERRING });

        // Ya procesamos el chunk 5
        const transfer = manager['store'].getTransfer(fileId, 'receiving');
        transfer.pendingChunks.add(5);
        // También marcamos chunksProcessed en 1 para empezar
        manager['store'].updateTransfer(fileId, 'receiving', { chunksProcessed: 1 });

        await new Promise(r => setTimeout(r, 50)); await manager.handleMessage('p9', 'addr9', { type: 'FILE_CHUNK', fileId, chunkIndex: 5, data: 'AAAA' });

        // Debe haber enviado ACK pero NO haber incrementado chunksProcessed (fue ignorado)
        await new Promise(r => setTimeout(r, 50));
        expect(mockSend).toHaveBeenCalledWith('addr9', expect.objectContaining({ type: 'FILE_ACK', chunkIndex: 5 }), undefined);
        const updated = manager['store'].getTransfer(fileId, 'receiving');
        expect(updated?.chunksProcessed).toBe(1); // Sigue en 1
    });

    it('should handle invalid chunk index', async () => {
        const fileId = 'id-invalid';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p10' });

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p10', peerAddress: 'addr10', totalChunks: 5, direction: 'receiving'
        });
        manager['store'].updateTransfer(fileId, 'receiving', { state: 'active' });

        // Index fuera de rango
        await manager.handleMessage('p10', 'addr10', { type: 'FILE_CHUNK', fileId, chunkIndex: 10, data: 'AAAA' });

        const transfer = manager['store'].getTransfer(fileId, 'receiving');
        expect(transfer?.chunksProcessed).toBe(0);
        expect(mockSend).not.toHaveBeenCalledWith('addr10', expect.objectContaining({ type: 'FILE_CHUNK_ACK' }), undefined);
    });

    it('should handle packet loss and trigger retransmission', async () => {
        vi.useFakeTimers();
        const fileId = 'id-loss';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p11', publicKey: 'kp11' });

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p11', peerAddress: 'addr11',
            fileName: 'f', fileSize: 1000, mimeType: 't', totalChunks: 50, chunkSize: 20, fileHash: 'h',
            direction: 'sending', filePath: '/path'
        });
        manager['store'].updateTransfer(fileId, 'sending', {
            state: 'active',
            phase: TransferPhase.TRANSFERRING,
            nextChunkIndex: 0,
            chunksProcessed: 0,
            windowSize: 1
        });

        // Simulamos manualmente el timer de retransmisión para el chunk 0
        const tx = manager['store'].getTransfer(fileId, 'sending');
        if (tx) {
            manager.setRetryTimer(fileId, 0, tx, 'addr11');
        }

        mockSend.mockClear();

        // El timer está en manager.setRetryTimer (5000ms)
        vi.advanceTimersByTime(5100);

        // Forzar la resolución de cualquier promesa pendiente
        await vi.runOnlyPendingTimersAsync();

        // Debería retransmitir el chunk 0
        expect(mockSend).toHaveBeenCalledWith('addr11', expect.objectContaining({ type: 'FILE_CHUNK', chunkIndex: 0 }), 'kp11');

        vi.useRealTimers();
    });

    it('should adjust RTO based on smoothed RTT', async () => {
        const fileId = 'id-rtt';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p12' });

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p12', peerAddress: 'addr12',
            totalChunks: 10, direction: 'sending', srtt: 200, rto: 400
        });
        manager['store'].updateTransfer(fileId, 'sending', { state: 'active', phase: TransferPhase.TRANSFERRING });

        const chunksSentTimes = new Map<number, number>();
        chunksSentTimes.set(0, Date.now() - 100); // Enviado hace 100ms

        // Mockeamos getTransfer con tipos correctos
        const originalGet = manager['store'].getTransfer.bind(manager['store']);
        vi.spyOn(manager['store'], 'getTransfer').mockImplementation((id: any, dir: any) => {
            const t = originalGet(id, dir);
            if (t && id === fileId) {
                (t as any)._chunksSentTimes = chunksSentTimes;
            }
            return t;
        });

        // Recibimos el ACK para el chunk 0
        await manager.handleMessage('p12', 'addr12', { type: 'FILE_ACK', fileId, chunkIndex: 0 });

        const updated = manager['store'].getTransfer(fileId, 'sending');
        // Cálculo: 0.9 * 200 + 0.1 * 100 = 180 + 10 = 190
        // Usamos una tolerancia mayor para evitar fallos por precisión de milisegundos en el test
        expect(Math.abs((updated?.srtt || 0) - 190)).toBeLessThanOrEqual(2);
    });

    it('should ignore late chunk ACKs for completed transfers', async () => {
        const fileId = 'id-late';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p13' });

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p13', peerAddress: 'addr13',
            fileName: 'f', fileSize: 100, mimeType: 't', totalChunks: 2, chunkSize: 50, fileHash: 'h',
            direction: 'sending'
        });
        manager['store'].updateTransfer(fileId, 'sending', {
            chunksProcessed: 1,
            state: 'completed',
            phase: TransferPhase.DONE
        });

        await manager.handleMessage('p13', 'addr13', { type: 'FILE_ACK', fileId, chunkIndex: 0 });

        const transfer = manager['store'].getTransfer(fileId, 'sending');
        expect(transfer?.chunksProcessed).toBe(1);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('should handle cancel by sender', async () => {
        const fileId = 'id-remote-cancel';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p14', publicKey: 'kp14' });

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p14', peerAddress: 'addr14', direction: 'receiving'
        });
        manager['store'].updateTransfer(fileId, 'receiving', { state: 'active' });

        // Simular mensaje de cancelación firmado
        await manager.handleMessage('p14', 'addr14', {
            type: 'FILE_CANCEL',
            fileId,
            reason: 'bye',
            signature: 'sig-cancel'
        });

        const transfer = manager['store'].getTransfer(fileId, 'receiving');
        expect(transfer?.state).toBe('cancelled');
    });

    it('should handle out-of-order chunks via sliding window', async () => {
        const fileId = 'id-window';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p15' });

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p15', peerAddress: 'addr15',
            fileName: 'f', fileSize: 100, mimeType: 't', totalChunks: 5, chunkSize: 20, fileHash: 'h',
            direction: 'receiving'
        });
        manager['store'].updateTransfer(fileId, 'receiving', { state: 'active', phase: TransferPhase.TRANSFERRING });

        // Recibir chunk 2 antes que el 0 y 1
        await manager.handleFileChunk('p15', 'addr15', { type: 'FILE_CHUNK', fileId, chunkIndex: 2, data: 'AAAA' });

        const updated = manager['store'].getTransfer(fileId, 'receiving');
        expect(updated?.chunksProcessed).toBe(1);
        // Comprobar que se ha guardado en el set de procesados
        expect(updated?.pendingChunks.has(2)).toBe(true);

        await new Promise(r => setTimeout(r, 10));
        expect(mockSend).toHaveBeenCalledWith('addr15', expect.objectContaining({ type: 'FILE_ACK', chunkIndex: 2 }), undefined);
    });

    it('should calculate window size growth correctly', async () => {
        const fileId = 'id-window-growth';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p16' });

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p16', peerAddress: 'addr16',
            fileName: 'f.txt', fileSize: 1000, mimeType: 'text/plain',
            totalChunks: 20, direction: 'sending', chunkSize: 50
        });
        // Inyectamos manualmente los valores para el inicio del test
        manager['store'].updateTransfer(fileId, 'sending', {
            state: 'active',
            phase: TransferPhase.TRANSFERRING,
            windowSize: 10,
            ssthresh: 15,
            srtt: 100,
            pendingChunks: new Set()
        });

        const chunksSentTimes = new Map<number, number>();
        chunksSentTimes.set(1, Date.now() - 50);

        const originalGet = manager['store'].getTransfer.bind(manager['store']);
        vi.spyOn(manager['store'], 'getTransfer').mockImplementation((id: any, dir: any) => {
            const t = originalGet(id, dir);
            if (t && id === fileId) (t as any)._chunksSentTimes = chunksSentTimes;
            return t;
        });

        // Recibimos ACK en slow start (windowSize < ssthresh)
        await manager.handleMessage('p16', 'addr16', { type: 'FILE_ACK', fileId, chunkIndex: 1 });

        const updated = manager['store'].getTransfer(fileId, 'sending');
        // El RTT es 50ms, SRTT anterior 100ms.
        // SRTT_new = 0.9 * 100 + 0.1 * 50 = 90 + 5 = 95ms.
        // Como SRTT_new < 150ms, growthFactor = 2.0.
        // windowSize crecía en handleAck original de transfer-manager.ts.
        // Pero en sender-logic.ts la lógica de crecimiento de ventana NO se migró.
        // Vamos a implementarla.
        expect(updated?.windowSize).toBe(12);
    });

    it('should handle file open error in sendNextChunks', async () => {
        const fileId = 'id-open-error';
        const fs = await import('node:fs/promises');
        vi.mocked(fs.open).mockRejectedValueOnce(new Error('Open failed'));

        manager['transferKeys'].set(fileId, Buffer.alloc(32));
        manager['store'].createTransfer({
            fileId, upeerId: 'p1', peerAddress: 'addr1',
            totalChunks: 1, direction: 'sending', filePath: '/invalid/path'
        });
        manager['store'].updateTransfer(fileId, 'sending', { state: 'active', phase: TransferPhase.TRANSFERRING });

        const transfer = manager['store'].getTransfer(fileId, 'sending');
        if (transfer) {
            await manager.sendNextChunks(transfer, 'addr1');
        }

        expect(manager['fileHandles'].has(fileId)).toBe(false);
    });

    it('should handle cancelation by peer (handleFileCancel)', async () => {
        const fileId = 'id-peer-cancel';
        manager['store'].createTransfer({
            fileId, upeerId: 'p1', peerAddress: 'addr1', direction: 'sending'
        });
        manager['store'].updateTransfer(fileId, 'sending', { state: 'active' });

        await manager.handleMessage('p1', 'addr1', { type: 'FILE_CANCEL', fileId, reason: 'remote' });

        const transfer = manager['store'].getTransfer(fileId, 'sending');
        expect(transfer?.state).toBe('cancelled');
    });

    it('should handle heartbeats', async () => {
        const fileId = 'id-heartbeat';
        manager['store'].createTransfer({
            fileId, upeerId: 'p1', peerAddress: 'addr1', direction: 'sending'
        });
        manager['store'].updateTransfer(fileId, 'sending', { state: 'active' });

        await manager.handleMessage('p1', 'addr1', { type: 'FILE_HEARTBEAT', fileId, t: Date.now() });

        expect(mockSend).toHaveBeenCalledWith('addr1', expect.objectContaining({ type: 'FILE_HEARTBEAT_ACK', fileId }), undefined);
    });

    it('should process all chunks regardless of arrival order (high-index first)', async () => {
        const fileId = 'id-order-regression';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p-order' });

        manager['store'].createTransfer({
            fileId, upeerId: 'p-order', peerAddress: 'addr-order',
            fileName: 'f.bin', fileSize: 500, mimeType: 'application/octet-stream',
            totalChunks: 5, chunkSize: 100, fileHash: 'h',
            direction: 'receiving'
        });
        manager['store'].updateTransfer(fileId, 'receiving', { state: 'active', phase: TransferPhase.TRANSFERRING });

        // Llegan en orden inverso: 4, 3, 2, 1, 0
        // Con el bug antiguo (chunkIndex < chunksProcessed), chunks 0,1,2 habrían sido descartados
        for (const idx of [4, 3, 2, 1, 0]) {
            await manager.handleMessage('p-order', 'addr-order', {
                type: 'FILE_CHUNK', fileId, chunkIndex: idx, data: 'AAAA'
            });
        }

        const transfer = manager['store'].getTransfer(fileId, 'receiving');
        expect(transfer?.chunksProcessed).toBe(5);
        expect(transfer?.state).toBe('completed');
    });

    it('should finalize receiver when FILE_DONE arrives after all chunks processed', async () => {
        const fileId = 'id-filedone-finalize';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p-fd', publicKey: 'kfd' });

        manager['store'].createTransfer({
            fileId, upeerId: 'p-fd', peerAddress: 'addr-fd',
            fileName: 'f.txt', fileSize: 100, mimeType: 'text/plain',
            totalChunks: 2, chunkSize: 50, fileHash: 'h',
            direction: 'receiving'
        });
        manager['store'].updateTransfer(fileId, 'receiving', {
            state: 'active', phase: TransferPhase.TRANSFERRING, tempPath: '/tmp/fd.tmp'
        });

        // Procesamos ambos chunks
        await manager.handleMessage('p-fd', 'addr-fd', { type: 'FILE_CHUNK', fileId, chunkIndex: 0, data: 'AAAA' });
        await manager.handleMessage('p-fd', 'addr-fd', { type: 'FILE_CHUNK', fileId, chunkIndex: 1, data: 'BBBB' });

        // Aunque finalizeTransfer ya se llamó desde handleFileChunk (totalChunks=2),
        // FILE_DONE no debe explotar ni llamar dos veces (guard de reentrancia)
        await manager.handleMessage('p-fd', 'addr-fd', { type: 'FILE_DONE', fileId });

        const transfer = manager['store'].getTransfer(fileId, 'receiving');
        expect(transfer?.state).toBe('completed');
        expect(mockSend).toHaveBeenCalledWith('addr-fd', { type: 'FILE_DONE_ACK', fileId }, 'kfd');
    });

    it('should acknowledge FILE_DONE without finalizing receiver state', async () => {
        const fileId = 'id-filedone-trigger';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p-fdt', publicKey: 'kfdt' });

        manager['store'].createTransfer({
            fileId, upeerId: 'p-fdt', peerAddress: 'addr-fdt',
            fileName: 'f.txt', fileSize: 100, mimeType: 'text/plain',
            totalChunks: 3, chunkSize: 34, fileHash: 'h',
            direction: 'receiving'
        });
        // Simulamos que el receptor ya procesó los 3 chunks pero por algún motivo
        // finalizeTransfer no fue llamado (el estado sigue 'active')
        manager['store'].updateTransfer(fileId, 'receiving', {
            state: 'active', phase: TransferPhase.TRANSFERRING,
            chunksProcessed: 3, tempPath: '/tmp/fdt.tmp'
        });

        await manager.handleMessage('p-fdt', 'addr-fdt', { type: 'FILE_DONE', fileId });

        const transfer = manager['store'].getTransfer(fileId, 'receiving');
        expect(transfer?.state).toBe('active');
        expect(mockSend).toHaveBeenCalledWith('addr-fdt', { type: 'FILE_DONE_ACK', fileId }, 'kfdt');
    });

    it('should not double-finalize on concurrent finalizeTransfer calls', async () => {
        const fileId = 'id-double-finalize';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p-df' });

        manager['store'].createTransfer({
            fileId, upeerId: 'p-df', peerAddress: 'addr-df',
            fileName: 'f.txt', fileSize: 100, mimeType: 'text/plain',
            totalChunks: 1, chunkSize: 100, fileHash: 'h',
            direction: 'receiving', tempPath: '/tmp/df.tmp'
        });
        manager['store'].updateTransfer(fileId, 'receiving', {
            state: 'active', phase: TransferPhase.TRANSFERRING
        });

        // Dos llamadas concurrentes simultáneas
        await Promise.all([
            manager.finalizeTransfer(fileId, 'receiving'),
            manager.finalizeTransfer(fileId, 'receiving'),
        ]);

        // notifyCompleted solo debe haberse emitido una vez
        const completedEvents = mockWin.webContents.send.mock.calls
            .filter((c: any[]) => c[0] === 'file-transfer-completed');
        expect(completedEvents.length).toBe(1);
    });

    it('should not process FILE_DONE if chunksProcessed < totalChunks', async () => {
        const fileId = 'id-filedone-partial';
        (contactsOps.getContactByUpeerId as any).mockResolvedValue({ upeerId: 'p-fdp', publicKey: 'kfdp' });

        manager['store'].createTransfer({
            fileId, upeerId: 'p-fdp', peerAddress: 'addr-fdp',
            fileName: 'f.txt', fileSize: 100, mimeType: 'text/plain',
            totalChunks: 5, chunkSize: 20, fileHash: 'h',
            direction: 'receiving'
        });
        manager['store'].updateTransfer(fileId, 'receiving', {
            state: 'active', phase: TransferPhase.TRANSFERRING, chunksProcessed: 3
        });

        // FILE_DONE llega pero solo tenemos 3/5 chunks — no debe finalizar
        await manager.handleMessage('p-fdp', 'addr-fdp', { type: 'FILE_DONE', fileId });

        const transfer = manager['store'].getTransfer(fileId, 'receiving');
        expect(transfer?.state).toBe('active');
        // FILE_DONE_ACK sí debe enviarse
        expect(mockSend).toHaveBeenCalledWith('addr-fdp', { type: 'FILE_DONE_ACK', fileId }, 'kfdp');
    });
});
