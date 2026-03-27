import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerDeviceHandlers } from '../../../../src/main_process/core/ipcHandlers/devices.js';
import * as deviceOps from '../../../../src/main_process/storage/devices-operations.js';

type IpcHandler = (event?: unknown, payload?: { deviceId: string; isTrusted: boolean }) => unknown;

function getRegisteredHandler(channel: string): IpcHandler {
    const call = vi.mocked(ipcMain.handle).mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    if (!call) throw new Error(`Missing handler for ${channel}`);
    return call[1] as IpcHandler;
}

vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn(),
    },
}));

vi.mock('../../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'my-upeer-id'),
    getMyDeviceId: vi.fn(() => 'my-device-id'),
}));

vi.mock('../../../../src/main_process/storage/devices-operations.js', () => ({
    getDevicesByUPeerId: vi.fn(),
    setDeviceTrust: vi.fn(),
}));

describe('Devices IPC Handlers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        registerDeviceHandlers();
    });

    it('should register get-devices handler', () => {
        expect(ipcMain.handle).toHaveBeenCalledWith('get-devices', expect.any(Function));
    });

    it('get-devices handler should call getDevicesByUPeerId', async () => {
        const handler = getRegisteredHandler('get-devices');
        const mockDevices = [{ deviceId: 'dev-1', clientName: 'Android' }];
        vi.mocked(deviceOps.getDevicesByUPeerId).mockResolvedValue(mockDevices);

        const result = await handler();
        expect(deviceOps.getDevicesByUPeerId).toHaveBeenCalledWith('my-upeer-id');
        expect(result).toEqual(mockDevices);
    });

    it('should register set-device-trust handler', () => {
        expect(ipcMain.handle).toHaveBeenCalledWith('set-device-trust', expect.any(Function));
    });

    it('set-device-trust handler should call setDeviceTrust', async () => {
        const handler = getRegisteredHandler('set-device-trust');
        await handler(null, { deviceId: 'dev-1', isTrusted: true });
        expect(deviceOps.setDeviceTrust).toHaveBeenCalledWith('my-upeer-id', 'dev-1', true);
    });
});
