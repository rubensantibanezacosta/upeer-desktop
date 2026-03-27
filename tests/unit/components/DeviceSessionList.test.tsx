import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { DeviceSessionList } from '../../../src/components/ui/settings/DeviceSessionList.js';
import { useDeviceStore } from '../../../src/store/useDeviceStore.js';

vi.mock('../../../src/store/useDeviceStore.js', () => ({
    useDeviceStore: vi.fn(),
}));

const mockFetchDevices = vi.fn();
const mockSetTrust = vi.fn();
const mockRemoveDevice = vi.fn();

type DeviceStoreSnapshot = ReturnType<typeof useDeviceStore>;

const createDeviceStoreSnapshot = (overrides: Partial<DeviceStoreSnapshot> = {}): DeviceStoreSnapshot => ({
    devices: [],
    isLoading: false,
    error: null,
    fetchDevices: mockFetchDevices,
    setTrust: mockSetTrust,
    removeDevice: mockRemoveDevice,
    ...overrides,
});

describe('DeviceSessionList Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useDeviceStore).mockReturnValue(createDeviceStoreSnapshot());
    });

    it('should show loading state', () => {
        vi.mocked(useDeviceStore).mockReturnValue(createDeviceStoreSnapshot({ isLoading: true }));

        render(<DeviceSessionList />);
        expect(screen.getByRole('progressbar')).toBeDefined();
    });

    it('should render a list of devices', async () => {
        const mockDevices = [
            { deviceId: 'dev-1', clientName: 'My Phone', platform: 'android', isTrusted: true, lastSeen: Date.now() },
            { deviceId: 'dev-2', clientName: 'Work PC', platform: 'linux', isTrusted: false, lastSeen: Date.now() },
        ];

        vi.mocked(useDeviceStore).mockReturnValue(createDeviceStoreSnapshot({ devices: mockDevices }));

        render(<DeviceSessionList />);

        expect(screen.getByText(/My Phone/i)).toBeDefined();
        expect(screen.getByText(/Work PC/i)).toBeDefined();
    });

    it('should call setTrust when trust button is clicked', async () => {
        const mockDevices = [
            { deviceId: 'dev-1', clientName: 'New Device', platform: 'android', isTrusted: false, lastSeen: Date.now() },
        ];

        vi.mocked(useDeviceStore).mockReturnValue(createDeviceStoreSnapshot({ devices: mockDevices }));

        render(<DeviceSessionList />);

        const trustBtn = screen.getByRole('button', { name: /confiar/i });
        fireEvent.click(trustBtn);

        expect(mockSetTrust).toHaveBeenCalledWith('dev-1', true);
    });
});
