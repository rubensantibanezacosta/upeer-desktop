import { describe, expect, it, beforeEach, vi } from 'vitest';

const upeerMock = {
    getDevices: vi.fn(),
    setDeviceTrust: vi.fn(),
    deleteDevice: vi.fn(),
};

describe('useDeviceStore', () => {
    let store: typeof import('../../../src/store/useDeviceStore.js').useDeviceStore;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.stubGlobal('window', { upeer: upeerMock });
        store = (await import('../../../src/store/useDeviceStore.js')).useDeviceStore;
        store.setState({ devices: [], isLoading: false, error: null });
    });

    it('fetchDevices carga dispositivos con éxito', async () => {
        upeerMock.getDevices.mockResolvedValue([{ id: 1, deviceId: 'd1' } as never]);
        await store.getState().fetchDevices();
        expect(store.getState().devices[0].id).toBe(1);
        expect(store.getState().devices[0].deviceId).toBe('d1');
        expect(store.getState().isLoading).toBe(false);
    });

    it('fetchDevices maneja errores', async () => {
        upeerMock.getDevices.mockRejectedValue(new Error('boom'));
        await store.getState().fetchDevices();
        expect(store.getState().error).toBe('boom');
        expect(store.getState().isLoading).toBe(false);
    });

    it('setTrust actualiza el flag del dispositivo', async () => {
        store.setState({ devices: [{ id: 1, deviceId: 'd1', isTrusted: false } as never] });
        upeerMock.setDeviceTrust.mockResolvedValue(undefined);
        await store.getState().setTrust('d1', true);
        expect(store.getState().devices[0].isTrusted).toBe(true);
        expect(upeerMock.setDeviceTrust).toHaveBeenCalledWith('d1', true);
    });

    it('setTrust maneja errores', async () => {
        upeerMock.setDeviceTrust.mockRejectedValue('raw error');
        await store.getState().setTrust('d1', true);
        expect(store.getState().error).toBe('Error desconocido');
    });

    it('removeDevice elimina el dispositivo', async () => {
        store.setState({ devices: [{ id: 1, deviceId: 'd1' } as never, { id: 2, deviceId: 'd2' } as never] });
        upeerMock.deleteDevice.mockResolvedValue(undefined);
        await store.getState().removeDevice('d1');
        expect(store.getState().devices).toEqual([{ id: 2, deviceId: 'd2' }]);
    });

    it('removeDevice maneja errores', async () => {
        upeerMock.deleteDevice.mockRejectedValue(new Error('no'));
        await store.getState().removeDevice('d1');
        expect(store.getState().error).toBe('no');
    });
});
