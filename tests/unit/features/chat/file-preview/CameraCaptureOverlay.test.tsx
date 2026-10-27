import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CameraCaptureOverlay } from '../../../../../src/features/chat/file-preview/CameraCaptureOverlay';

const drawImage = vi.fn();

const setCamera = (getUserMedia: (() => Promise<MediaStream>) | null) => {
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: getUserMedia ? { getUserMedia } : undefined,
    });
};

const renderOverlay = (props: Partial<React.ComponentProps<typeof CameraCaptureOverlay>> = {}) => {
    const onCapture = vi.fn();
    const onClose = vi.fn();
    render(<CameraCaptureOverlay open shots={[]} onCapture={onCapture} onClose={onClose} {...props} />);
    const video = document.querySelector('video') as HTMLVideoElement;
    if (video) {
        Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 });
        Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 });
    }
    return { onCapture, onClose };
};

describe('CameraCaptureOverlay', () => {
    beforeEach(() => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
        vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');
        Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: () => Promise.resolve() });
        Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, writable: true, value: null });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        setCamera(null);
        drawImage.mockClear();
    });

    it('no dibuja nada con el overlay cerrado', () => {
        setCamera(() => Promise.resolve({ getTracks: () => [] } as unknown as MediaStream));
        renderOverlay({ open: false });
        expect(document.querySelector('video')).toBeNull();
    });

    it('avisa cuando el equipo no expone ninguna cámara', async () => {
        setCamera(null);
        renderOverlay();
        expect(await screen.findByText('Este equipo no expone ninguna cámara a la aplicación.')).toBeInTheDocument();
    });

    it('avisa cuando el usuario deniega el permiso', async () => {
        setCamera(() => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })));
        renderOverlay();
        expect(await screen.findByText('No hay permiso para usar la cámara.')).toBeInTheDocument();
    });

    it('compone la foto del vídeo como JPEG y la entrega sin cerrar el overlay', async () => {
        setCamera(() => Promise.resolve({ getTracks: () => [] } as unknown as MediaStream));
        const { onCapture, onClose } = renderOverlay();

        await waitFor(() => expect(screen.getByRole('button', { name: 'Capturar foto' })).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: 'Capturar foto' }));

        expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 900);
        expect(onCapture).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA');
        expect(onClose).not.toHaveBeenCalled();
    });

    it('cuenta las fotos hechas y las muestra como miniaturas', () => {
        setCamera(() => Promise.resolve({ getTracks: () => [] } as unknown as MediaStream));
        renderOverlay({ shots: ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB'] });
        expect(screen.getByText('2 fotos')).toBeInTheDocument();
        expect(screen.getByAltText('Foto 1')).toBeInTheDocument();
        expect(screen.getByAltText('Foto 2')).toBeInTheDocument();
    });

    it('solo deja terminar cuando hay alguna foto', async () => {
        setCamera(() => Promise.resolve({ getTracks: () => [] } as unknown as MediaStream));
        const { onClose } = renderOverlay();
        expect(screen.getByRole('button', { name: 'Terminar de hacer fotos' })).toBeDisabled();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Capturar foto' })).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: 'Cerrar cámara' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('pide la cámara trasera por defecto y cambia a la frontal', async () => {
        const getUserMedia = vi.fn(() => Promise.resolve({ getTracks: () => [] } as unknown as MediaStream));
        setCamera(getUserMedia);
        renderOverlay();

        await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
        expect(getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ video: expect.objectContaining({ facingMode: 'environment' }) }));

        fireEvent.click(screen.getByRole('button', { name: 'Girar cámara' }));
        await waitFor(() => expect(getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ video: expect.objectContaining({ facingMode: 'user' }) })));
    });
});
