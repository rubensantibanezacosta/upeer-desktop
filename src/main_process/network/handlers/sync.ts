import { BrowserWindow } from 'electron';
import { getMyUPeerId, getMyDeviceId } from '../../security/identity.js';
import { debug } from '../../security/secure-logger.js';

type SyncAction = 'MESSAGE_READ' | 'MESSAGE_DELETE' | 'MESSAGE_EDIT';

type SyncPulsePayload = {
    deviceId?: string;
    action?: SyncAction | string;
    messageId?: string;
    newContent?: string;
};

type BroadcastPulsePayload = Record<string, unknown>;

type KademliaTwinNode = {
    upeerId?: string;
    address: string;
};

type KademliaContactLookup = {
    findClosestContacts(targetId: string, count: number): KademliaTwinNode[];
};

export async function handleSyncPulse(
    senderUpeerId: string,
    data: SyncPulsePayload,
    win: BrowserWindow | null
) {
    const myId = getMyUPeerId();
    const myDeviceId = getMyDeviceId();

    if (senderUpeerId !== myId || data.deviceId === myDeviceId) {
        return;
    }

    debug('SYNC_PULSE received from twin device', { deviceId: data.deviceId, action: data.action }, 'network');

    switch (data.action) {
        case 'MESSAGE_READ':
            if (data.messageId) {
                const { updateMessageStatus } = await import('../../storage/messages/status.js');
                await updateMessageStatus(data.messageId, 'read');
                if (win) {
                    win.webContents.send('message-status-updated', { id: data.messageId, status: 'read' });
                }
            }
            break;

        case 'MESSAGE_DELETE':
            if (data.messageId) {
                const { deleteMessageLocally, getMessageById } = await import('../../storage/messages/operations.js');
                const message = await getMessageById(data.messageId) as { chatUpeerId?: string } | undefined;
                await deleteMessageLocally(data.messageId);
                if (win && message?.chatUpeerId) {
                    const chatUpeerId = message.chatUpeerId;
                    win.webContents.send('message-deleted', {
                        id: data.messageId,
                        upeerId: chatUpeerId,
                        chatUpeerId,
                    });
                }
            }
            break;

        case 'MESSAGE_EDIT':
            if (data.messageId && data.newContent) {
                const { updateMessageContent, getMessageById } = await import('../../storage/messages/operations.js');
                const message = await getMessageById(data.messageId) as { chatUpeerId?: string } | undefined;
                await updateMessageContent(data.messageId, data.newContent);
                if (win && message?.chatUpeerId) {
                    const chatUpeerId = message.chatUpeerId;
                    win.webContents.send('message-updated', {
                        id: data.messageId,
                        upeerId: chatUpeerId,
                        chatUpeerId,
                        content: data.newContent,
                    });
                }
            }
            break;
    }
}

export async function broadcastPulse(action: string, payload: BroadcastPulsePayload) {
    const myId = getMyUPeerId();
    const myDeviceId = getMyDeviceId();
    const { getKademliaInstance } = await import('../dht/shared.js');
    const { sendSecureUDPMessage } = await import('../server/transport.js');
    const { getYggstackAddress } = await import('../../sidecars/yggstack.js');

    const kademlia = getKademliaInstance() as KademliaContactLookup | null;
    if (!kademlia) {
        return;
    }

    const myYgg = getYggstackAddress();
    const pulseData = {
        type: 'SYNC_PULSE',
        action,
        deviceId: myDeviceId,
        ...payload,
    };

    const seenAddresses = new Set<string>();
    const selfNodes = kademlia.findClosestContacts(myId, 20)
        .filter((node) => {
            if (node.upeerId !== myId || typeof node.address !== 'string') {
                return false;
            }
            const address = node.address.trim();
            if (!address || address === myYgg || seenAddresses.has(address)) {
                return false;
            }
            seenAddresses.add(address);
            return true;
        });

    for (const node of selfNodes) {
        sendSecureUDPMessage(node.address, pulseData, undefined, true);
    }
}
