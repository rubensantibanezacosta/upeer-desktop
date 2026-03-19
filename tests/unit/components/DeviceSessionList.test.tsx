import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { DeviceSessionList } from '../../../src/components/ui/settings/DeviceSessionList.js';
import { useDeviceStore } from '../../../src/store/useDeviceStore.js';

vi.mock('../../../src/store/useDeviceStore.js', () => ({
    useDeviceStore: vi.fn(),
}));

describe('DeviceSessionList Component', () => {
    const mockFetchDevices = vi.fn();
    const mockSetTrust = vi.fn();
    const mockRemoveDevice = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (useDeviceStore as any).mockReturnValue({
            devices: [],
            isLoading: false,
            fetchDevices: mockFetchDevices,
            setTrust: mockSetTrust,
            removeDevice: mockRemoveDevice,
        });
    });

    it('should show loading state', () => {
        (useDeviceStore as any).mockReturnValue({
            devices: [],
            isLoading: true,
            fetchDevices: mockFetchDevices,
        });

        render(<DeviceSessionList />);
        expect(screen.getByRole('progressbar')).toBeDefined();
    });

    it('should render a list of devices', async () => {
        const mockDevices = [
            { deviceId: 'dev-1', clientName: 'My Phone', platform: 'android', isTrusted: true, lastSeen: Date.now() },
            { deviceId: 'dev-2', clientName: 'Work PC', platform: 'linux', isTrusted: false, lastSeen: Date.now() },
        ];

        (useDeviceStore as any).mockReturnValue({
            devices: mockDevices,
            isLoading: false,
            fetchDevices: mockFetchDevices,
        });

        render(<DeviceSessionList />);

        expect(screen.getByText(/My Phone/i)).toBeDefined();
        expect(screen.getByText(/Work PC/i)).toBeDefined();
    });

    it('should call setTrust when trust button is clicked', async () => {
        const mockDevices = [
            { deviceId: 'dev-1', clientName: 'New Device', platform: 'android', isTrusted: false, lastSeen: Date.now() },
        ];

        (useDeviceStore as any).mockReturnValue({
            devices: mockDevices,
            isLoading: false,
            fetchDevices: mockFetchDevices,
            setTrust: mockSetTrust,
        });

        render(<DeviceSessionList />);

        const trustBtn = screen.getByRole('button', { name: /confiar/i });
        fireEvent.click(trustBtn);

        expect(mockSetTrust).toHaveBeenCalledWith('dev-1', true);
    });
});
