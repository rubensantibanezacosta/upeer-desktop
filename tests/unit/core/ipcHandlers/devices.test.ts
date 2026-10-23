import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerDeviceHandlers } from '../../../../src/main_process/core/ipcHandlers/devices.js';
import * as deviceOps from '../../../../src/main_process/storage/devices-operations.js';
import { loadAccountRegistryState } from '../../../../src/main_process/security/accountRegistryState.js';
import { revokeMyAccountDevice } from '../../../../src/main_process/network/accountRegistryRevocation.js';
import { publishMyAccountRegistry } from '../../../../src/main_process/network/accountRegistry.js';

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
    deleteDevice: vi.fn(),
}));

vi.mock('../../../../src/main_process/security/accountRegistryState.js', () => ({
    loadAccountRegistryState: vi.fn(),
}));

vi.mock('../../../../src/main_process/network/accountRegistry.js', () => ({
    publishMyAccountRegistry: vi.fn(async () => true),
}));

vi.mock('../../../../src/main_process/network/accountRegistryRevocation.js', () => ({
    revokeMyAccountDevice: vi.fn(),
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
        const mockDevices = [{ deviceId: 'dev-1', clientName: 'Android' }] as unknown as Awaited<ReturnType<typeof deviceOps.getDevicesByUPeerId>>;
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

    it('get-authorized-devices devuelve el registro persistido', () => {
        vi.mocked(loadAccountRegistryState).mockReturnValue({
            version: 1,
            accountUpeerId: 'aa'.repeat(32),
            epoch: 4,
            issuedAt: 1,
            revoked: [],
            devices: [{
                deviceId: 'bb'.repeat(32),
                devicePublicKey: 'cc'.repeat(32),
                platform: 'android',
                capabilities: ['dht'],
                authorizedAt: 10,
                expiresAt: 20,
                epoch: 4,
            }],
        });
        const handler = getRegisteredHandler('get-authorized-devices');

        expect(handler()).toEqual({
            devices: [{
                deviceId: 'bb'.repeat(32),
                devicePublicKey: 'cc'.repeat(32),
                platform: 'android',
                capabilities: ['dht'],
                authorizedAt: 10,
                expiresAt: 20,
                epoch: 4,
            }],
            epoch: 4,
        });
    });

    it('get-authorized-devices responde vacío sin registro', () => {
        vi.mocked(loadAccountRegistryState).mockReturnValue(null);
        const handler = getRegisteredHandler('get-authorized-devices');
        expect(handler()).toEqual({ devices: [], epoch: null });
    });

    it('revoke-authorized-device revoca, borra y republica', async () => {
        vi.mocked(revokeMyAccountDevice).mockReturnValue({ epoch: 7 } as never);
        const handler = getRegisteredHandler('revoke-authorized-device');

        const result = await handler(null, { deviceId: 'bb'.repeat(32), isTrusted: false });

        expect(revokeMyAccountDevice).toHaveBeenCalledWith('bb'.repeat(32), expect.any(String));
        expect(deviceOps.deleteDevice).toHaveBeenCalledWith('my-upeer-id', 'bb'.repeat(32));
        expect(publishMyAccountRegistry).toHaveBeenCalled();
        expect(result).toEqual({ success: true, epoch: 7, published: true });
    });

    it('revoke-authorized-device informa del fallo', async () => {
        vi.mocked(revokeMyAccountDevice).mockImplementation(() => {
            throw new Error('the local device cannot revoke itself');
        });
        const handler = getRegisteredHandler('revoke-authorized-device');

        const result = await handler(null, { deviceId: 'bb'.repeat(32), isTrusted: false });

        expect(result).toEqual({ success: false, error: 'No se pudo revocar el dispositivo.' });
        expect(deviceOps.deleteDevice).not.toHaveBeenCalled();
    });
});
