import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('lucide-react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('lucide-react')>()),
    Trash2: () => <span data-testid="DeleteIcon" />,
}));

import { RecordingBar } from '../../../../../src/features/chat/input/RecordingBar';

const canvasRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement | null>;

describe('RecordingBar', () => {
    it('muestra la duración formateada y el botón de descartar', () => {
        render(<RecordingBar duration={65} onCancel={vi.fn()} canvasRef={canvasRef} />);
        expect(screen.getByText('1:05')).toBeTruthy();
        expect(screen.getByTestId('DeleteIcon')).toBeTruthy();
    });

    it('llama a onCancel al pulsar descartar', () => {
        const onCancel = vi.fn();
        render(<RecordingBar duration={0} onCancel={onCancel} canvasRef={canvasRef} />);
        fireEvent.click(screen.getByLabelText('Descartar nota de voz'));
        expect(onCancel).toHaveBeenCalled();
    });

    it('no pinta el botón de enviar: vive fuera de la píldora', () => {
        render(<RecordingBar duration={3} onCancel={vi.fn()} canvasRef={canvasRef} />);
        expect(screen.queryByTestId('SendIcon')).toBeNull();
    });

    it('formatea duraciones de menos de un minuto', () => {
        render(<RecordingBar duration={9} onCancel={vi.fn()} canvasRef={canvasRef} />);
        expect(screen.getByText('0:09')).toBeTruthy();
    });
});
