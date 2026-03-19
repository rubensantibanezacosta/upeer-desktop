import { BrowserWindow } from 'electron';
import { getMyUPeerId, getMyDeviceId } from '../../security/identity.js';
import { debug } from '../../security/secure-logger.js';

/**
 * SYNC_PULSE: Protocolo de sincronización entre dispositivos del mismo usuario (Twin Peers).
 * Permite que un dispositivo informe a sus gemelos sobre cambios de estado (lecturas, borrados, ediciones).
 */

export async function handleSyncPulse(
    senderUpeerId: string,
    data: any,
    win: BrowserWindow | null
) {
    const myId = getMyUPeerId();
    const myDeviceId = getMyDeviceId();

    // Solo procesamos pulsos de nuestro propio ID pero de otros dispositivos
    if (senderUpeerId !== myId || data.deviceId === myDeviceId) {
        return;
    }

    debug('SYNC_PULSE received from twin device', { deviceId: data.deviceId, action: data.action }, 'network');

    switch (data.action) {
        case 'MESSAGE_READ':
            if (data.messageId) {
                const { updateMessageStatus } = await import('../../storage/messages/status.js');
                await updateMessageStatus(data.messageId, 'read');
                if (win) win.webContents.send('message-status-updated', { messageId: data.messageId, status: 'read' });
            }
            break;

        case 'MESSAGE_DELETE':
            if (data.messageId) {
                const { deleteMessageLocally } = await import('../../storage/messages/operations.js');
                await deleteMessageLocally(data.messageId);
                if (win) win.webContents.send('message-deleted', { messageId: data.messageId });
            }
            break;

        case 'MESSAGE_EDIT':
            if (data.messageId && data.newContent) {
                const { updateMessageContent } = await import('../../storage/messages/operations.js');
                await updateMessageContent(data.messageId, data.newContent);
                if (win) win.webContents.send('message-content-updated', { messageId: data.messageId, content: data.newContent });
            }
            break;
    }
}

/**
 * Difunde un pulso de sincronización a todos los dispositivos gemelos activos.
 */
export async function broadcastPulse(action: string, payload: any) {
    const myId = getMyUPeerId();
    const myDeviceId = getMyDeviceId();
    const { getKademliaInstance } = await import('../dht/shared.js');
    const { sendSecureUDPMessage } = await import('../server/transport.js');
    const { getYggstackAddress } = await import('../../sidecars/yggstack.js');

    const kademlia = getKademliaInstance();
    if (!kademlia) return;

    const myYgg = getYggstackAddress();

    const pulseData = {
        type: 'SYNC_PULSE',
        action,
        deviceId: myDeviceId,
        ...payload
    };

    // Obtenemos todos los dispositivos registrados para nuestro ID en la tabla de ruteo
    // (o recientemente vistos)
    const selfNodes = kademlia.findClosestContacts(myId, 20)
        .filter(n => n.upeerId === myId && n.address !== myYgg);

    for (const node of selfNodes) {
        sendSecureUDPMessage(node.address, pulseData, undefined, true);
    }
}
