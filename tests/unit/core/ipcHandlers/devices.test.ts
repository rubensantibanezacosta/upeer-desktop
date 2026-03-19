import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerDeviceHandlers } from '../../../../src/main_process/core/ipcHandlers/devices.js';
import * as deviceOps from '../../../../src/main_process/storage/devices-operations.js';

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
        const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'get-devices')[1];
        const mockDevices = [{ deviceId: 'dev-1', clientName: 'Android' }];
        (deviceOps.getDevicesByUPeerId as any).mockResolvedValue(mockDevices);

        const result = await handler();
        expect(deviceOps.getDevicesByUPeerId).toHaveBeenCalledWith('my-upeer-id');
        expect(result).toEqual(mockDevices);
    });

    it('should register set-device-trust handler', () => {
        expect(ipcMain.handle).toHaveBeenCalledWith('set-device-trust', expect.any(Function));
    });

    it('set-device-trust handler should call setDeviceTrust', async () => {
        const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'set-device-trust')[1];
        await handler(null, { deviceId: 'dev-1', isTrusted: true });
        expect(deviceOps.setDeviceTrust).toHaveBeenCalledWith('my-upeer-id', 'dev-1', true);
    });
});
