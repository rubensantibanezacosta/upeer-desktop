import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileTransfer } from '../../../src/hooks/useFileTransfer';
import type { FileTransfer, StartTransferParams } from '../../../src/hooks/fileTransferTypes';

const mockUpeer = {
    onFileTransferStarted: vi.fn(),
    onFileTransferProgress: vi.fn(),
    onFileTransferCompleted: vi.fn(),
    onFileTransferCancelled: vi.fn(),
    onFileTransferFailed: vi.fn(),
    getFileTransfers: vi.fn(),
    startFileTransfer: vi.fn(),
    cancelFileTransfer: vi.fn(),
    retryFileTransfer: vi.fn(),
    saveTransferredFile: vi.fn(),
};

type FileTransferWindow = Window & { upeer: typeof mockUpeer };

(window as FileTransferWindow).upeer = mockUpeer;

type TransferResult = Awaited<ReturnType<ReturnType<typeof useFileTransfer>['startTransfer']>>;
type ProgressInput = Pick<FileTransfer, 'state' | 'progress'>;

describe('useFileTransfer hook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpeer.getFileTransfers.mockResolvedValue({ success: true, transfers: [] });
    });

    it('should initialize with empty transfers and load them on mount', async () => {
        mockUpeer.getFileTransfers.mockResolvedValue({
            success: true,
            transfers: [{ fileId: '1', fileName: 'test.txt', progress: 0 }]
        });

        const { result } = renderHook(() => useFileTransfer());

        // Esperar a que se cargue la lista inicial
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(mockUpeer.getFileTransfers).toHaveBeenCalled();
        expect(result.current.transfers).toHaveLength(1);
        expect(result.current.transfers[0].fileId).toBe('1');
    });

    it('should register event listeners on mount', async () => {
        renderHook(() => useFileTransfer());

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(mockUpeer.onFileTransferStarted).toHaveBeenCalled();
        expect(mockUpeer.onFileTransferProgress).toHaveBeenCalled();
        expect(mockUpeer.onFileTransferCompleted).toHaveBeenCalled();
        expect(mockUpeer.onFileTransferCancelled).toHaveBeenCalled();
        expect(mockUpeer.onFileTransferFailed).toHaveBeenCalled();
    });

    it('should update progress correctly from IPC events', async () => {
        const initialTransfer = {
            fileId: 'f1',
            direction: 'receiving',
            progress: 10,
            state: 'active'
        };
        mockUpeer.getFileTransfers.mockResolvedValue({ success: true, transfers: [initialTransfer] });

        const { result } = renderHook(() => useFileTransfer());

        // Cargar inicial
        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        // Simular evento de progreso
        const progressHandler = mockUpeer.onFileTransferProgress.mock.calls[0][0];

        await act(async () => {
            progressHandler({
                fileId: 'f1',
                direction: 'receiving',
                progress: 55,
                bytesTransferred: 550,
                totalBytes: 1000,
                state: 'active'
            });
        });

        expect(result.current.transfers[0].progress).toBe(55);
        expect(result.current.transfers[0].bytesTransferred).toBe(550);
    });

    it('should handle transfer completion and notify external callback', async () => {
        const onStateChange = vi.fn();
        const initialTransfer = { fileId: 'f2', state: 'active', progress: 90 };
        mockUpeer.getFileTransfers.mockResolvedValue({ success: true, transfers: [initialTransfer] });

        renderHook(() => useFileTransfer(onStateChange));

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        const completionHandler = mockUpeer.onFileTransferCompleted.mock.calls[0][0];

        await act(async () => {
            completionHandler({ fileId: 'f2', fileHash: 'hash123' });
        });

        expect(onStateChange).toHaveBeenCalledWith('f2', expect.objectContaining({
            transferState: 'completed',
            fileHash: 'hash123'
        }));
    });

    it('passes savedPath to callback when receiving side completes with tempPath', async () => {
        const onStateChange = vi.fn();
        const initialTransfer = { fileId: 'recv-1', direction: 'receiving', state: 'active', progress: 99 };
        mockUpeer.getFileTransfers.mockResolvedValue({ success: true, transfers: [initialTransfer] });

        renderHook(() => useFileTransfer(onStateChange));
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

        const completionHandler = mockUpeer.onFileTransferCompleted.mock.calls[0][0];

        await act(async () => {
            completionHandler({
                fileId: 'recv-1',
                fileHash: 'abc123hash',
                direction: 'receiving',
                tempPath: '/home/user/.config/chat-p2p/assets/received/recv-1.jpg'
            });
        });

        expect(onStateChange).toHaveBeenCalledWith('recv-1', {
            fileHash: 'abc123hash',
            transferState: 'completed',
            savedPath: '/home/user/.config/chat-p2p/assets/received/recv-1.jpg'
        });
    });

    it('does NOT pass savedPath to callback when sending side completes', async () => {
        const onStateChange = vi.fn();
        const initialTransfer = { fileId: 'send-1', direction: 'sending', state: 'active', progress: 99 };
        mockUpeer.getFileTransfers.mockResolvedValue({ success: true, transfers: [initialTransfer] });

        renderHook(() => useFileTransfer(onStateChange));
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

        const completionHandler = mockUpeer.onFileTransferCompleted.mock.calls[0][0];

        await act(async () => {
            completionHandler({
                fileId: 'send-1',
                fileHash: 'deadbeef',
                direction: 'sending',
                tempPath: '/tmp/some-original-path.jpg'
            });
        });

        const callArgs = onStateChange.mock.calls[0][1];
        expect(callArgs.savedPath).toBeUndefined();
        expect(callArgs.transferState).toBe('completed');
        expect(callArgs.fileHash).toBe('deadbeef');
    });

    it('passes savedPath as undefined when receiving completes without tempPath', async () => {
        const onStateChange = vi.fn();
        mockUpeer.getFileTransfers.mockResolvedValue({ success: true, transfers: [] });

        renderHook(() => useFileTransfer(onStateChange));
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

        const completionHandler = mockUpeer.onFileTransferCompleted.mock.calls[0][0];

        await act(async () => {
            completionHandler({
                fileId: 'recv-2',
                fileHash: 'somehash',
                direction: 'receiving'
            });
        });

        const callArgs = onStateChange.mock.calls[0][1];
        expect(callArgs.savedPath).toBeUndefined();
    });

    it('should call startFileTransfer IPC when startTransfer is called', async () => {
        mockUpeer.startFileTransfer.mockResolvedValue({ success: true, fileId: 'new-file' });
        const { result } = renderHook(() => useFileTransfer());

        const startParams: StartTransferParams = {
            upeerId: 'peer1',
            filePath: '/path/to/file.jpg',
            thumbnail: 'thumb-data'
        };

        let startResult: TransferResult | undefined;
        await act(async () => {
            startResult = await result.current.startTransfer(startParams);
        });

        expect(mockUpeer.startFileTransfer).toHaveBeenCalledWith('peer1', '/path/to/file.jpg', 'thumb-data', undefined, undefined, undefined);
        expect(startResult?.success).toBe(true);
    });

    it('should call cancelFileTransfer IPC', async () => {
        mockUpeer.cancelFileTransfer.mockResolvedValue({ success: true });
        const { result } = renderHook(() => useFileTransfer());

        await act(async () => {
            await result.current.cancelTransfer('f-cancel', 'User clicked cancel');
        });

        expect(mockUpeer.cancelFileTransfer).toHaveBeenCalledWith('f-cancel', 'User clicked cancel');
    });

    it('should format progress correctly', async () => {
        const { result } = renderHook(() => useFileTransfer());

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        const t1: ProgressInput = { state: 'completed', progress: 100 };
        const t2: ProgressInput = { state: 'active', progress: 45.67 };
        const t3: Partial<ProgressInput> & Pick<FileTransfer, 'state'> = { state: 'failed' };

        expect(result.current.formatProgress(t1)).toBe('Completado');
        expect(result.current.formatProgress(t2)).toBe('45.7%');
        expect(result.current.formatProgress(t3)).toBe('Falló');
    });
});
