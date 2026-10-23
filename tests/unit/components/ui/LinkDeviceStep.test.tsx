import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { LinkDeviceStep } from '../../../../src/components/ui/login/LinkDeviceStep.js';

vi.mock('@mui/icons-material/ArrowBack', () => ({ default: () => <span /> }));
vi.mock('@mui/icons-material/QrCodeScanner', () => ({ default: () => <span /> }));
vi.mock('@mui/icons-material/ContentCopy', () => ({ default: () => <span /> }));
vi.mock('qrcode.react', () => ({
    QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr" data-value={value} />,
}));

const expiresAt = Date.now() + 300_000;

interface UpeerStub {
    beginEnrollment: ReturnType<typeof vi.fn>;
    finishEnrollment: ReturnType<typeof vi.fn>;
    cancelEnrollment: ReturnType<typeof vi.fn>;
    writeClipboardText: ReturnType<typeof vi.fn>;
}

const bridge = window as unknown as { upeer?: UpeerStub };

function stubBridge(overrides: Partial<UpeerStub> = {}): UpeerStub {
    const stub: UpeerStub = {
        beginEnrollment: vi.fn(async () => ({ success: true, requestCode: 'request-code', accountUpeerId: 'c'.repeat(64), expiresAt })),
        finishEnrollment: vi.fn(async () => ({ success: true, deviceId: 'd'.repeat(64) })),
        cancelEnrollment: vi.fn(async () => ({ success: true })),
        writeClipboardText: vi.fn(async () => ({ success: true })),
        ...overrides,
    };
    bridge.upeer = stub;
    return stub;
}

describe('LinkDeviceStep', () => {
    beforeEach(() => {
        stubBridge();
    });

    afterEach(() => {
        bridge.upeer = undefined;
        vi.clearAllMocks();
    });

    it('pide el código de invitación', () => {
        render(<LinkDeviceStep onBack={vi.fn()} onLinked={vi.fn()} />);
        expect(screen.getByPlaceholderText('Pega la invitación')).toBeDefined();
        expect(screen.getByRole('button', { name: /continuar/i })).toBeDefined();
    });

    it('muestra la solicitud tras leer la invitación', async () => {
        const stub = stubBridge();
        render(<LinkDeviceStep onBack={vi.fn()} onLinked={vi.fn()} />);

        fireEvent.change(screen.getByPlaceholderText('Pega la invitación'), { target: { value: 'invite-code' } });
        fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

        await waitFor(() => expect(screen.getByText('request-code')).toBeDefined());
        expect(stub.beginEnrollment).toHaveBeenCalledWith('invite-code');
    });

    it('informa del error si la invitación no es válida', async () => {
        stubBridge({ beginEnrollment: vi.fn(async () => ({ success: false, error: 'La invitación no es válida o ha caducado.' })) });
        render(<LinkDeviceStep onBack={vi.fn()} onLinked={vi.fn()} />);

        fireEvent.change(screen.getByPlaceholderText('Pega la invitación'), { target: { value: 'nope' } });
        fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

        await waitFor(() => expect(screen.getByText('La invitación no es válida o ha caducado.')).toBeDefined());
    });

    it('instala el certificado y avisa al completar', async () => {
        const onLinked = vi.fn();
        const stub = stubBridge();
        render(<LinkDeviceStep onBack={vi.fn()} onLinked={onLinked} />);

        fireEvent.change(screen.getByPlaceholderText('Pega la invitación'), { target: { value: 'invite-code' } });
        fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
        await waitFor(() => expect(screen.getByText('request-code')).toBeDefined());

        fireEvent.change(screen.getByPlaceholderText('Pega la respuesta'), { target: { value: 'response-code' } });
        fireEvent.click(screen.getByRole('button', { name: /instalar certificado/i }));

        await waitFor(() => expect(onLinked).toHaveBeenCalledTimes(1));
        expect(stub.finishEnrollment).toHaveBeenCalledWith('response-code');
    });

    it('no avisa de éxito si el certificado es rechazado', async () => {
        const onLinked = vi.fn();
        stubBridge({ finishEnrollment: vi.fn(async () => ({ success: false, error: 'El certificado de enrolamiento no es válido.' })) });
        render(<LinkDeviceStep onBack={vi.fn()} onLinked={onLinked} />);

        fireEvent.change(screen.getByPlaceholderText('Pega la invitación'), { target: { value: 'invite-code' } });
        fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
        await waitFor(() => expect(screen.getByText('request-code')).toBeDefined());

        fireEvent.change(screen.getByPlaceholderText('Pega la respuesta'), { target: { value: 'bad' } });
        fireEvent.click(screen.getByRole('button', { name: /instalar certificado/i }));

        await waitFor(() => expect(screen.getByText('El certificado de enrolamiento no es válido.')).toBeDefined());
        expect(onLinked).not.toHaveBeenCalled();
    });

    it('cancela el enrolamiento al volver', async () => {
        const onBack = vi.fn();
        const stub = stubBridge();
        render(<LinkDeviceStep onBack={onBack} onLinked={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /volver/i }));

        await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
        expect(stub.cancelEnrollment).toHaveBeenCalled();
    });
});
