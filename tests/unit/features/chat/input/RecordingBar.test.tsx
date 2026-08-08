import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@mui/icons-material/Delete', () => ({ default: () => <span data-testid="DeleteIcon" /> }));
vi.mock('@mui/icons-material/FiberManualRecord', () => ({ default: () => <span data-testid="RecordIcon" /> }));
vi.mock('@mui/icons-material/Send', () => ({ default: () => <span data-testid="SendIcon" /> }));

import { RecordingBar } from '../../../../../src/features/chat/input/RecordingBar';

const canvasRef = { current: document.createElement('canvas') } as React.RefObject<HTMLCanvasElement | null>;

describe('RecordingBar', () => {
    it('muestra la duración formateada y el botón de cancelar', () => {
        render(
            <RecordingBar duration={65} onCancel={vi.fn()} onSend={vi.fn()} disabled={false} isSending={false} canvasRef={canvasRef} />
        );
        expect(screen.getByText('1:05')).toBeTruthy();
        expect(screen.getByTestId('DeleteIcon')).toBeTruthy();
    });

    it('llama a onCancel al pulsar eliminar', () => {
        const onCancel = vi.fn();
        render(
            <RecordingBar duration={0} onCancel={onCancel} onSend={vi.fn()} disabled={false} isSending={false} canvasRef={canvasRef} />
        );
        fireEvent.click(screen.getByTestId('DeleteIcon'));
        expect(onCancel).toHaveBeenCalled();
    });

    it('llama a onSend al pulsar enviar', () => {
        const onSend = vi.fn();
        render(
            <RecordingBar duration={3} onCancel={vi.fn()} onSend={onSend} disabled={false} isSending={false} canvasRef={canvasRef} />
        );
        fireEvent.click(screen.getByTestId('SendIcon').closest('button') as HTMLButtonElement);
        expect(onSend).toHaveBeenCalled();
    });

    it('deshabilita el envío mientras está enviando', () => {
        const onSend = vi.fn();
        render(
            <RecordingBar duration={3} onCancel={vi.fn()} onSend={onSend} disabled={false} isSending canvasRef={canvasRef} />
        );
        const sendBtn = screen.getByText('…').closest('button') as HTMLButtonElement;
        expect(sendBtn).toBeDisabled();
        fireEvent.click(sendBtn);
        expect(onSend).not.toHaveBeenCalled();
    });

    it('formatea duraciones de menos de un minuto', () => {
        render(
            <RecordingBar duration={9} onCancel={vi.fn()} onSend={vi.fn()} disabled={false} isSending={false} canvasRef={canvasRef} />
        );
        expect(screen.getByText('0:09')).toBeTruthy();
    });
});
