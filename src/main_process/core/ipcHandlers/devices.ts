import { ipcMain } from 'electron';
import { getMyDeviceId, getMyUPeerId } from '../../security/identity.js';
import { getKademliaInstance } from '../../network/dht/shared.js';
import { toKademliaId } from '../../network/dht/kademlia/types.js';

/**
 * Registra los manejadores IPC para la gestión de múltiples dispositivos
 */
export function registerDeviceHandlers(): void {
    /**
     * Obtiene la lista de dispositivos conocidos vinculados a la identidad actual
     * consultando la propia entrada de ubicación en el nodo Kademlia local.
     */
    ipcMain.handle('get-my-devices', async () => {
        const myId = getMyUPeerId();
        const myDeviceId = getMyDeviceId();
        const kademlia = getKademliaInstance();

        if (!kademlia || !myId) return [];

        // Buscamos nuestra propia clave de ubicación en el ValueStore local
        const key = toKademliaId(myId);
        const storedValue = kademlia.getLocalValue(key);

        if (!storedValue || !Array.isArray(storedValue.value)) {
            // Si solo hay un dispositivo (el actual), devolvemos una lista mínima
            return [{
                deviceId: myDeviceId,
                isCurrent: true,
                lastSeen: Date.now()
            }];
        }

        // El ValueStore ahora guarda una lista de LocationBlocks para multi-device
        return storedValue.value.map((block: any) => ({
            deviceId: block.deviceId,
            isCurrent: block.deviceId === myDeviceId,
            lastSeen: storedValue.timestamp, // Aproximación, el bloque individual no tiene TS propio aún
            address: block.address,
            metadata: block.deviceMeta
        }));
    });
}
