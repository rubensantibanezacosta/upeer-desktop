import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileTransfer } from '../../../src/hooks/useFileTransfer';

// Mock de window.upeer (IPC Bridge)
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

(window as any).upeer = mockUpeer;

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

    it('should call startFileTransfer IPC when startTransfer is called', async () => {
        mockUpeer.startFileTransfer.mockResolvedValue({ success: true, fileId: 'new-file' });
        const { result } = renderHook(() => useFileTransfer());

        const startParams = {
            upeerId: 'peer1',
            filePath: '/path/to/file.jpg',
            thumbnail: 'thumb-data'
        };

        let startResult: any;
        await act(async () => {
            startResult = await result.current.startTransfer(startParams);
        });

        expect(mockUpeer.startFileTransfer).toHaveBeenCalledWith('peer1', '/path/to/file.jpg', 'thumb-data', undefined);
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

        const t1 = { state: 'completed', progress: 100 } as any;
        const t2 = { state: 'active', progress: 45.67 } as any;
        const t3 = { state: 'failed' } as any;

        expect(result.current.formatProgress(t1)).toBe('Completado');
        expect(result.current.formatProgress(t2)).toBe('45.7%');
        expect(result.current.formatProgress(t3)).toBe('Falló');
    });
});
