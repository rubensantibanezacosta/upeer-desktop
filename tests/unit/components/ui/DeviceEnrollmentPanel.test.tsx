import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { DeviceEnrollmentPanel } from '../../../../src/components/ui/settings/DeviceEnrollmentPanel.js';

vi.mock('@mui/icons-material/AddLink', () => ({ default: () => <span /> }));
vi.mock('@mui/icons-material/Verified', () => ({ default: () => <span /> }));
vi.mock('@mui/icons-material/ContentCopy', () => ({ default: () => <span /> }));
vi.mock('qrcode.react', () => ({
    QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr" data-value={value} />,
}));

const expiresAt = Date.now() + 300_000;

interface UpeerStub {
    createEnrollmentInvite: ReturnType<typeof vi.fn>;
    completeEnrollment: ReturnType<typeof vi.fn>;
    writeClipboardText: ReturnType<typeof vi.fn>;
}

const bridge = window as unknown as { upeer?: UpeerStub };

function stubBridge(overrides: Partial<UpeerStub> = {}): UpeerStub {
    const stub: UpeerStub = {
        createEnrollmentInvite: vi.fn(async () => ({ success: true, code: 'invite-code', inviteId: 'a'.repeat(64), expiresAt })),
        completeEnrollment: vi.fn(async () => ({ success: true, code: 'response-code', deviceId: 'b'.repeat(64), expiresAt })),
        writeClipboardText: vi.fn(async () => ({ success: true })),
        ...overrides,
    };
    bridge.upeer = stub;
    return stub;
}

describe('DeviceEnrollmentPanel', () => {
    beforeEach(() => {
        stubBridge();
    });

    afterEach(() => {
        bridge.upeer = undefined;
        vi.clearAllMocks();
    });

    it('muestra el botón para generar la invitación', () => {
        render(<DeviceEnrollmentPanel />);
        expect(screen.getByRole('button', { name: /generar invitación/i })).toBeDefined();
    });

    it('muestra el código y el QR de la invitación generada', async () => {
        render(<DeviceEnrollmentPanel />);
        fireEvent.click(screen.getByRole('button', { name: /generar invitación/i }));

        await waitFor(() => expect(screen.getByText('invite-code')).toBeDefined());
        expect(screen.getByTestId('qr').getAttribute('data-value')).toBe('invite-code');
    });

    it('informa del error al crear la invitación', async () => {
        stubBridge({ createEnrollmentInvite: vi.fn(async () => ({ success: false, error: 'sin raíz' })) });
        render(<DeviceEnrollmentPanel />);
        fireEvent.click(screen.getByRole('button', { name: /generar invitación/i }));

        await waitFor(() => expect(screen.getByText('sin raíz')).toBeDefined());
    });

    it('autoriza la solicitud y muestra la respuesta', async () => {
        const stub = stubBridge();
        render(<DeviceEnrollmentPanel />);
        fireEvent.click(screen.getByRole('button', { name: /generar invitación/i }));
        await waitFor(() => expect(screen.getByText('invite-code')).toBeDefined());

        const textarea = screen.getByPlaceholderText('Pega el código de solicitud');
        fireEvent.change(textarea, { target: { value: 'request-code' } });
        fireEvent.click(screen.getByRole('button', { name: /autorizar dispositivo/i }));

        await waitFor(() => expect(screen.getByText('response-code')).toBeDefined());
        expect(stub.completeEnrollment).toHaveBeenCalledWith('request-code');
    });

    it('muestra el error cuando la solicitud no se puede autorizar', async () => {
        stubBridge({ completeEnrollment: vi.fn(async () => ({ success: false, error: 'invitación caducada' })) });
        render(<DeviceEnrollmentPanel />);
        fireEvent.click(screen.getByRole('button', { name: /generar invitación/i }));
        await waitFor(() => expect(screen.getByText('invite-code')).toBeDefined());

        fireEvent.change(screen.getByPlaceholderText('Pega el código de solicitud'), { target: { value: 'bad' } });
        fireEvent.click(screen.getByRole('button', { name: /autorizar dispositivo/i }));

        await waitFor(() => expect(screen.getByText('invitación caducada')).toBeDefined());
    });
});
