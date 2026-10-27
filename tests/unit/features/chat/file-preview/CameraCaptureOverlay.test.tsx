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

    it('mantiene cuadrados y redondos los tres botones del pie', async () => {
        setCamera(() => Promise.resolve({ getTracks: () => [] } as unknown as MediaStream));
        renderOverlay();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Capturar foto' })).toBeEnabled());

        const shapes = ['Girar cámara', 'Capturar foto', 'Terminar de hacer fotos'].map((name) => {
            const style = window.getComputedStyle(screen.getByRole('button', { name }));
            return { name, width: style.width, height: style.height, radius: style.borderRadius };
        });

        shapes.forEach((shape) => {
            expect(shape.width).toBe(shape.height);
            expect(shape.radius).toBe('50%');
        });
        expect(shapes.map((shape) => shape.width)).toEqual(['44px', '52px', '44px']);
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

    it('se monta en el mismo contenedor que el overlay de adjuntos para ocupar su misma caja', () => {
        setCamera(() => Promise.resolve({ getTracks: () => [] } as unknown as MediaStream));
        const pane = document.createElement('div');
        const composer = document.createElement('div');
        composer.style.position = 'absolute';
        composer.style.height = '68px';
        pane.appendChild(composer);
        document.body.appendChild(pane);

        const onCapture = vi.fn();
        render(
            <CameraCaptureOverlay open shots={[]} onCapture={onCapture} onClose={vi.fn()} container={pane} />,
            { container: composer },
        );

        const close = screen.getByRole('button', { name: 'Cerrar cámara' });
        expect(composer.contains(close)).toBe(false);
        let top: HTMLElement = close;
        while (top.parentElement && top.parentElement !== pane) top = top.parentElement;
        expect(top.parentElement).toBe(pane);
        expect(top.contains(document.querySelector('video'))).toBe(true);
        pane.remove();
    });

    it('cae al body si no se le da contenedor', () => {
        setCamera(() => Promise.resolve({ getTracks: () => [] } as unknown as MediaStream));
        render(<CameraCaptureOverlay open shots={[]} onCapture={vi.fn()} onClose={vi.fn()} />);

        const close = screen.getByRole('button', { name: 'Cerrar cámara' });
        let top: HTMLElement = close;
        while (top.parentElement && top.parentElement !== document.body) top = top.parentElement;
        expect(top.parentElement).toBe(document.body);
    });

    it('engancha el stream al vídeo para que se vea lo que enfoca la cámara', async () => {
        const stream = { getTracks: () => [] } as unknown as MediaStream;
        setCamera(() => Promise.resolve(stream));
        let attached: unknown = null;
        Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
            configurable: true,
            get: () => attached,
            set: (value: unknown) => { attached = value; },
        });

        renderOverlay();

        await waitFor(() => expect(attached).toBe(stream));
        const video = document.querySelector('video') as HTMLVideoElement;
        expect(video).toHaveAttribute('playsinline');
        expect(video).toHaveAttribute('autoplay');
    });
});
