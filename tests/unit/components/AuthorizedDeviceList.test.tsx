import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizedDeviceList } from '../../../src/components/ui/settings/AuthorizedDeviceList.js';

const DEVICE = {
    deviceId: 'bb'.repeat(32),
    devicePublicKey: 'cc'.repeat(32),
    platform: 'android',
    capabilities: ['dht'],
    authorizedAt: 10,
    expiresAt: 20,
    epoch: 4,
};

describe('AuthorizedDeviceList', () => {
    const originalUpeer = window.upeer;

    const stub = (payload: { devices: unknown[]; revoked: Array<{ deviceId: string; revokedAt: number }> }) => {
        Object.defineProperty(window, 'upeer', {
            configurable: true,
            value: {
                ...originalUpeer,
                getAuthorizedDevices: vi.fn().mockResolvedValue({ ...payload, epoch: 4, localDeviceId: DEVICE.deviceId }),
                onAuthorizedDevicesChanged: vi.fn().mockReturnValue(() => undefined),
            },
        });
    };

    beforeEach(() => {
        stub({ devices: [DEVICE], revoked: [] });
    });

    afterEach(() => {
        cleanup();
        Object.defineProperty(window, 'upeer', { configurable: true, value: originalUpeer });
    });

    it('no pinta la lista de revocados cuando no hay ninguno', async () => {
        render(<AuthorizedDeviceList />);
        await waitFor(() => expect(screen.getByText('ESTE DISPOSITIVO')).toBeDefined());
        expect(screen.queryByText('REVOCADOS')).toBeNull();
    });

    it('pinta los revocados con su fecha y la nota de revinculación', async () => {
        stub({ devices: [DEVICE], revoked: [{ deviceId: 'dd'.repeat(32), revokedAt: 9 }] });
        render(<AuthorizedDeviceList />);

        await waitFor(() => expect(screen.getByText('REVOCADOS')).toBeDefined());
        expect(screen.getByText('dd'.repeat(32))).toBeDefined();
        expect(screen.getByText(/puede volver a vincularse con una invitación/)).toBeDefined();
    });
});
