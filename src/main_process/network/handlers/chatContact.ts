import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { saveMessage, getMessageById } from '../../storage/messages/operations.js';

const serializeContactCardMessage = (data: any) => JSON.stringify({
    type: 'contact_card',
    text: '',
    contact: {
        name: data.contactName || '',
        address: data.contactAddress || '',
        upeerId: data.upeerId || '',
        publicKey: data.contactPublicKey || '',
        avatar: data.contactAvatar || undefined,
    },
});

export async function handleChatContact(
    upeerId: string,
    data: any,
    win: BrowserWindow | null,
    signature: string,
    fromAddress: string,
    sendResponse: (ip: string, data: any) => void,
): Promise<void> {
    const msgId = typeof data.id === 'string' && data.id ? data.id : randomUUID();
    const existing = await getMessageById(msgId);

    if (existing) {
        sendResponse(fromAddress, { type: 'ACK', id: msgId, status: 'delivered' });
        return;
    }

    const content = serializeContactCardMessage(data);
    const saved = await saveMessage(msgId, upeerId, false, content, undefined, signature, 'delivered', upeerId, data.timestamp);
    const isNew = (saved as any)?.changes > 0;

    if (isNew) {
        win?.webContents.send('receive-p2p-message', {
            id: msgId,
            upeerId,
            isMine: false,
            message: content,
            status: 'delivered',
            encrypted: false,
            timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
        });
    }

    sendResponse(fromAddress, { type: 'ACK', id: msgId, status: 'delivered' });
}