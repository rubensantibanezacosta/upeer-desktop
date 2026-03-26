import { BrowserWindow } from 'electron';
import { error } from '../../security/secure-logger.js';
import { getKademliaInstance } from './shared.js';
import { handleDhtFoundNodes, handleDhtFoundValue } from './pendingQueries.js';
import { handleDhtExchange, handleDhtQuery, handleDhtResponse, handleDhtUpdate } from './legacyHandlers.js';

export async function handleDhtPacket(
    type: string,
    data: any,
    senderUpeerId: string,
    senderAddress: string,
    win: BrowserWindow | null,
    sendResponse: (ip: string, data: any) => void
): Promise<boolean> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return false;

    try {
        if (type === 'DHT_UPDATE') {
            await handleDhtUpdate(senderUpeerId, data, getKademliaInstance, win);
            return true;
        }
        if (type === 'DHT_EXCHANGE') {
            await handleDhtExchange(senderUpeerId, data);
            return true;
        }
        if (type === 'DHT_QUERY') {
            await handleDhtQuery(senderUpeerId, data, senderAddress, sendResponse, getKademliaInstance);
            return true;
        }
        if (type === 'DHT_RESPONSE') {
            await handleDhtResponse(data);
            return true;
        }
        if (type === 'DHT_FOUND_NODES') {
            handleDhtFoundNodes(data, senderAddress, getKademliaInstance);
            return true;
        }
        if (type === 'DHT_FOUND_VALUE') {
            handleDhtFoundValue(data, senderAddress);
            return true;
        }
        if (type.startsWith('DHT_')) {
            const response = await kademlia.handleMessage(senderUpeerId, data, senderAddress);
            if (response) {
                sendResponse(senderAddress, response);
            }
            return true;
        }
    } catch (err) {
        error(`Error handling ${type}`, err, 'dht');
    }

    return false;
}
