import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CameraCaptureModal } from '../../../../../src/features/chat/input/CameraCaptureModal';

const drawImage = vi.fn();

const setCamera = (getUserMedia: (() => Promise<MediaStream>) | null) => {
    Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: getUserMedia ? { getUserMedia } : undefined,
    });
};

const renderModal = (onCapture = vi.fn()) => {
    render(<CameraCaptureModal open onClose={vi.fn()} onCapture={onCapture} />);
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 });
    return onCapture;
};

describe('CameraCaptureModal', () => {
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

    it('avisa cuando el equipo no expone ninguna cámara', async () => {
        setCamera(null);
        renderModal();
        expect(await screen.findByText('Este equipo no expone ninguna cámara a la aplicación.')).toBeInTheDocument();
    });

    it('avisa cuando el usuario deniega el permiso', async () => {
        setCamera(() => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })));
        renderModal();
        expect(await screen.findByText('No hay permiso para usar la cámara.')).toBeInTheDocument();
    });

    it('compone la foto del vídeo como JPEG y la entrega', async () => {
        const stop = vi.fn();
        setCamera(() => Promise.resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream));
        const onCapture = renderModal();

        await waitFor(() => expect(screen.getByRole('button', { name: 'Capturar' })).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: 'Capturar' }));

        expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 900);
        expect(onCapture).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA');
    });

    it('pide la cámara trasera por defecto y cambia a la frontal', async () => {
        const getUserMedia = vi.fn(() => Promise.resolve({ getTracks: () => [] } as unknown as MediaStream));
        setCamera(getUserMedia);
        renderModal();

        await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
        expect(getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ video: expect.objectContaining({ facingMode: 'environment' }) }));

        fireEvent.click(screen.getByRole('button', { name: 'Girar' }));
        await waitFor(() => expect(getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ video: expect.objectContaining({ facingMode: 'user' }) })));
    });
});
