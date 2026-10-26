import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { DeviceEnrollmentPanel } from '../../../../src/components/ui/settings/DeviceEnrollmentPanel.js';

vi.mock('qrcode.react', () => ({
    QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr" data-value={value} />,
}));

const expiresAt = Date.now() + 300_000;
const newDeviceId = 'b'.repeat(64);

interface UpeerStub {
    createEnrollmentInvite: ReturnType<typeof vi.fn>;
    completeEnrollment: ReturnType<typeof vi.fn>;
    getAuthorizedDevices: ReturnType<typeof vi.fn>;
    writeClipboardText: ReturnType<typeof vi.fn>;
}

const bridge = window as unknown as { upeer?: UpeerStub };

const emptyDevices = { success: true, devices: [], epoch: 1 };
const devicesWithNewOne = {
    success: true,
    epoch: 2,
    devices: [{
        deviceId: newDeviceId,
        devicePublicKey: 'c'.repeat(64),
        platform: 'android',
        capabilities: ['dht'],
        authorizedAt: Date.now(),
        expiresAt,
        epoch: 2,
    }],
};

function stubBridge(overrides: Partial<UpeerStub> = {}): UpeerStub {
    const stub: UpeerStub = {
        createEnrollmentInvite: vi.fn(async () => ({ success: true, code: 'invite-code', inviteId: 'a'.repeat(64), expiresAt })),
        completeEnrollment: vi.fn(async () => ({ success: true, code: 'response-code', deviceId: newDeviceId, expiresAt })),
        getAuthorizedDevices: vi.fn(async () => emptyDevices),
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
        expect(screen.getByText(/esperando a que el dispositivo nuevo/i)).toBeDefined();
    });

    it('detecta el dispositivo nuevo y avisa al panel padre', async () => {
        const onEnrolled = vi.fn();
        stubBridge({
            getAuthorizedDevices: vi.fn()
                .mockResolvedValueOnce(emptyDevices)
                .mockResolvedValue(devicesWithNewOne),
        });
        render(<DeviceEnrollmentPanel onEnrolled={onEnrolled} />);
        fireEvent.click(screen.getByRole('button', { name: /generar invitación/i }));

        await waitFor(() => expect(screen.getByText(/dispositivo añadido a tu cuenta/i)).toBeDefined(), { timeout: 5000 });
        expect(onEnrolled).toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /terminar/i })).toBeDefined();
    });

    it('informa del error al crear la invitación', async () => {
        stubBridge({ createEnrollmentInvite: vi.fn(async () => ({ success: false, error: 'sin raíz' })) });
        render(<DeviceEnrollmentPanel />);
        fireEvent.click(screen.getByRole('button', { name: /generar invitación/i }));

        await waitFor(() => expect(screen.getByText('sin raíz')).toBeDefined());
    });

    it('autoriza con el código de solicitud pegado y muestra la respuesta', async () => {
        const stub = stubBridge();
        render(<DeviceEnrollmentPanel />);
        fireEvent.click(screen.getByRole('button', { name: /generar invitación/i }));
        await waitFor(() => expect(screen.getByText('invite-code')).toBeDefined());

        fireEvent.change(screen.getByPlaceholderText(/código de solicitud del dispositivo nuevo/i), { target: { value: 'request-code' } });
        fireEvent.click(screen.getByRole('button', { name: /autorizar con este código/i }));

        await waitFor(() => expect(screen.getByText('response-code')).toBeDefined());
        expect(stub.completeEnrollment).toHaveBeenCalledWith('request-code');
    });

    it('muestra el error cuando la solicitud no se puede autorizar', async () => {
        stubBridge({ completeEnrollment: vi.fn(async () => ({ success: false, error: 'invitación caducada' })) });
        render(<DeviceEnrollmentPanel />);
        fireEvent.click(screen.getByRole('button', { name: /generar invitación/i }));
        await waitFor(() => expect(screen.getByText('invite-code')).toBeDefined());

        fireEvent.change(screen.getByPlaceholderText(/código de solicitud del dispositivo nuevo/i), { target: { value: 'bad' } });
        fireEvent.click(screen.getByRole('button', { name: /autorizar con este código/i }));

        await waitFor(() => expect(screen.getByText('invitación caducada')).toBeDefined());
    });
});
