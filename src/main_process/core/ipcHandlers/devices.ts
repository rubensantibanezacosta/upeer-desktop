import { ipcMain } from 'electron';
import { getMyUPeerId } from '../../security/identity.js';
import { getDevicesByUPeerId, setDeviceTrust, deleteDevice } from '../../storage/devices-operations.js';
import { getMyAccountRegistry, publishMyAccountRegistry } from '../../network/accountRegistry.js';
import { revokeMyAccountDevice } from '../../network/accountRegistryRevocation.js';
import { loadAccountRegistryState } from '../../security/accountRegistryState.js';
import { getDeviceIdentity } from '../../security/deviceIdentity.js';
import { notifyDeviceRegistryChanged } from '../deviceRegistryEvents.js';
import { broadcastSyncRegistry } from '../../network/sync/transport.js';
import { warn } from '../../security/secure-logger.js';

function readLocalDeviceId(): string | null {
    return getDeviceIdentity()?.deviceId ?? null;
}

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
        notifyDeviceRegistryChanged();
        const published = await publishMyAccountRegistry();
        return { success: true, epoch: registry.epoch, published };
    });

    ipcMain.handle('get-authorized-devices', () => {
        const localDeviceId = readLocalDeviceId();
        const registry = getMyAccountRegistry();
        const state = loadAccountRegistryState();
        const devices = registry?.devices ?? state?.devices ?? [];
        if (devices.length === 0) return { devices: [], epoch: registry?.epoch ?? state?.epoch ?? null, localDeviceId };
        return {
            devices: devices.map(device => ({
                deviceId: device.deviceId,
                devicePublicKey: device.devicePublicKey,
                platform: device.platform,
                capabilities: device.capabilities,
                authorizedAt: device.authorizedAt,
                expiresAt: device.expiresAt,
                epoch: device.epoch,
            })),
            epoch: registry?.epoch ?? state?.epoch ?? null,
            localDeviceId,
        };
    });

    ipcMain.handle('revoke-authorized-device', async (_event, { deviceId }: { deviceId: string }) => {
        try {
            const registry = revokeMyAccountDevice(deviceId, 'device revoked by the account owner');
            const myId = getMyUPeerId();
            if (myId) await deleteDevice(myId, deviceId);
            notifyDeviceRegistryChanged();
            const published = await publishMyAccountRegistry();
            const notified = broadcastSyncRegistry();
            return { success: true, epoch: registry.epoch, published, notified };
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            warn('No se pudo revocar el dispositivo autorizado', { deviceId, error: detail }, 'security');
            return { success: false, error: 'No se pudo revocar el dispositivo.' };
        }
    });
}
