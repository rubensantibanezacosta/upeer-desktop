import { ipcMain } from 'electron';
import { getMyUPeerId } from '../../security/identity.js';
import { getDevicesByUPeerId, setDeviceTrust, deleteDevice } from '../../storage/devices-operations.js';
import { publishMyAccountRegistry } from '../../network/accountRegistry.js';
import { revokeMyAccountDevice } from '../../network/accountRegistryRevocation.js';
import { loadAccountRegistryState } from '../../security/accountRegistryState.js';
import { warn } from '../../security/secure-logger.js';

/**
 * Registra los manejadores IPC para la gestión de múltiples dispositivos
 */
export function registerDeviceHandlers(): void {
    /**
     * Obtiene la lista de dispositivos registrados para el usuario actual.
     */
    ipcMain.handle('get-devices', async () => {
        const myId = getMyUPeerId();
        if (!myId) return [];
        return getDevicesByUPeerId(myId);
    });

    /**
     * Establece el estado de confianza de un dispositivo.
     */
    ipcMain.handle('set-device-trust', async (_event, { deviceId, isTrusted }: { deviceId: string, isTrusted: boolean }) => {
        const myId = getMyUPeerId();
        if (!myId) throw new Error('Identity not loaded');
        await setDeviceTrust(myId, deviceId, isTrusted);
        return { success: true };
    });

    /**
     * Elimina un dispositivo registrado.
     */
    ipcMain.handle('delete-device', async (_event, { deviceId }: { deviceId: string }) => {
        const myId = getMyUPeerId();
        if (!myId) throw new Error('Identity not loaded');
        const registry = revokeMyAccountDevice(deviceId, 'device removed by the account owner');
        await deleteDevice(myId, deviceId);
        const published = await publishMyAccountRegistry();
        return { success: true, epoch: registry.epoch, published };
    });

    ipcMain.handle('get-authorized-devices', () => {
        const state = loadAccountRegistryState();
        if (!state) return { devices: [], epoch: null };
        return {
            devices: state.devices.map(device => ({
                deviceId: device.deviceId,
                devicePublicKey: device.devicePublicKey,
                platform: device.platform,
                capabilities: device.capabilities,
                authorizedAt: device.authorizedAt,
                expiresAt: device.expiresAt,
                epoch: device.epoch,
            })),
            epoch: state.epoch,
        };
    });

    ipcMain.handle('revoke-authorized-device', async (_event, { deviceId }: { deviceId: string }) => {
        try {
            const registry = revokeMyAccountDevice(deviceId, 'device revoked by the account owner');
            const myId = getMyUPeerId();
            if (myId) await deleteDevice(myId, deviceId);
            const published = await publishMyAccountRegistry();
            return { success: true, epoch: registry.epoch, published };
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            warn('No se pudo revocar el dispositivo autorizado', { deviceId, error: detail }, 'security');
            return { success: false, error: 'No se pudo revocar el dispositivo.' };
        }
    });
}
