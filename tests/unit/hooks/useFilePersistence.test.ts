import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { create } from 'zustand';

const mocks = vi.hoisted(() => ({
    setPendingFiles: vi.fn(),
    setIsDragging: vi.fn(),
    addFileTransferMessage: vi.fn(),
    setFilePickerOpen: vi.fn(),
    setPreparingAttachments: vi.fn(),
    setShareModalOpen: vi.fn(),
}));

vi.mock('../../../src/store/useChatStore', () => {
    type S = {
        contacts: { upeerId: string; status: string }[];
        targetUpeerId: string | null;
        activeGroupId: string | null;
        pendingFiles: unknown[];
        setPendingFiles: (f: unknown[]) => void;
        setIsDragging: (v: boolean) => void;
        addFileTransferMessage: (...a: unknown[]) => void;
    };
    const store = create<S>(() => ({
        contacts: [],
        targetUpeerId: 'peer-1',
        activeGroupId: null,
        pendingFiles: [],
        setPendingFiles: mocks.setPendingFiles,
        setIsDragging: mocks.setIsDragging,
        addFileTransferMessage: mocks.addFileTransferMessage,
    }));
    return { useChatStore: store };
});

vi.mock('../../../src/store/useNavigationStore', () => {
    const store = create(() => ({
        setFilePickerOpen: mocks.setFilePickerOpen,
        setPreparingAttachments: mocks.setPreparingAttachments,
        setShareModalOpen: mocks.setShareModalOpen,
    }));
    return { useNavigationStore: store };
});

const upeerMock = {
    persistSelectedFile: vi.fn(),
    getPathForFile: vi.fn(),
    openFileDialog: vi.fn(),
    saveBufferToTemp: vi.fn(),
    persistInternalAsset: vi.fn(),
};

type FPWindow = { upeer: typeof upeerMock };
(window as unknown as FPWindow).upeer = upeerMock;

import { useChatStore } from '../../../src/store/useChatStore';
import { useFilePersistence } from '../../../src/hooks/useFilePersistence';

const startTransfer = vi.fn();

function makeHook() {
    return renderHook(() => useFilePersistence({ startTransfer } as never));
}

describe('useFilePersistence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useChatStore.setState({ contacts: [{ upeerId: 'peer-1', status: 'connected' }] as never, targetUpeerId: 'peer-1' as never, activeGroupId: null as never });
        startTransfer.mockResolvedValue({ success: true, fileId: 'f1' });
    });

    it('handleDragOver activa dragging solo con destinatario conectado', () => {
        const { result } = makeHook();
        const e = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as never;
        act(() => result.current.handleDragOver(e));
        expect(mocks.setIsDragging).toHaveBeenCalledWith(true);
    });

    it('handleDragLeave desactiva dragging cuando sale del contenedor', () => {
        const { result } = makeHook();
        const e = { preventDefault: vi.fn(), stopPropagation: vi.fn(), currentTarget: { contains: vi.fn(() => false) } } as never;
        act(() => result.current.handleDragLeave(e));
        expect(mocks.setIsDragging).toHaveBeenCalledWith(false);
    });

    it('handleDrop persiste archivos y abre el picker', async () => {
        upeerMock.persistSelectedFile.mockResolvedValue({ success: true, path: '/tmp/x.png' });
        const e = {
            preventDefault: vi.fn(), stopPropagation: vi.fn(),
            dataTransfer: { files: [{ name: 'x.png', size: 5, type: '', lastModified: 1 }] },
        } as never;
        const { result } = makeHook();
        await act(async () => { await result.current.handleDrop(e); });
        expect(mocks.setPendingFiles).toHaveBeenCalled();
        expect(mocks.setFilePickerOpen).toHaveBeenCalledWith(true);
    });

    it('handleAttachFile de tipo contact abre el share modal', async () => {
        const { result } = makeHook();
        await act(async () => { await result.current.handleAttachFile('contact'); });
        expect(mocks.setShareModalOpen).toHaveBeenCalledWith(true);
    });

    it('handleAttachFile abre el diálogo y añade los archivos', async () => {
        upeerMock.openFileDialog.mockResolvedValue({ success: true, canceled: false, files: [{ path: '/a.txt' }] });
        const { result } = makeHook();
        await act(async () => { await result.current.handleAttachFile('document'); });
        expect(mocks.setFilePickerOpen).toHaveBeenCalledWith(true);
        expect(mocks.setPendingFiles).toHaveBeenCalled();
    });

    it('handleFileSubmit inicia la transferencia y añade el mensaje', async () => {
        const { result } = makeHook();
        await act(async () => {
            await result.current.handleFileSubmit([{ path: '/a.txt', name: 'a.txt', size: 5, type: 'text/plain', lastModified: 1 }]);
        });
        expect(startTransfer).toHaveBeenCalledWith(expect.objectContaining({ filePath: '/a.txt' }));
        expect(mocks.addFileTransferMessage).toHaveBeenCalled();
        expect(mocks.setFilePickerOpen).toHaveBeenCalledWith(false);
    });

    it('handleSendVoiceNote guarda el audio y lo envía como nota de voz', async () => {
        const file = { name: 'voice.webm', size: 10, type: 'audio/webm' } as unknown as File;
        vi.stubGlobal('FileReader', class {
            result = 'data:audio/webm;base64,AAAA';
            onloadend: (() => void) | null = null;
            onerror: (() => void) | null = null;
            readAsDataURL() { this.onloadend?.(); }
        });
        upeerMock.saveBufferToTemp.mockResolvedValue({ success: true, path: '/tmp/voice.webm' });
        upeerMock.persistInternalAsset.mockResolvedValue({ success: true, path: '/final/voice.webm' });
        const { result } = makeHook();
        await act(async () => { await result.current.handleSendVoiceNote(file); });
        expect(startTransfer).toHaveBeenCalledWith(expect.objectContaining({ isVoiceNote: true }));
        expect(mocks.addFileTransferMessage).toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});
