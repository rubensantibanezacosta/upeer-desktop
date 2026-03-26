import { ipcMain } from 'electron';
import { getMyUPeerId } from '../../security/identity.js';
import { getDevicesByUPeerId, setDeviceTrust, deleteDevice } from '../../storage/devices-operations.js';

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
        await deleteDevice(myId, deviceId);
        return { success: true };
    });
}
