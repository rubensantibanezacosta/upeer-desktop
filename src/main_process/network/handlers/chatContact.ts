import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { saveMessage, getMessageById } from '../../storage/messages/operations.js';

type ChatContactPacket = {
    id?: string;
    timestamp?: number;
    contactName?: string;
    contactAddress?: string;
    upeerId?: string;
    contactPublicKey?: string;
    contactAvatar?: string;
};

type SaveMessageResult = {
    changes?: number;
} | undefined;

type AckPacket = {
    type: 'ACK';
    id: string;
    status: 'delivered';
};

const serializeContactCardMessage = (data: ChatContactPacket) => JSON.stringify({
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
    data: ChatContactPacket,
    win: BrowserWindow | null,
    signature: string,
    fromAddress: string,
    sendResponse: (ip: string, data: AckPacket) => void,
): Promise<void> {
    const msgId = typeof data.id === 'string' && data.id ? data.id : randomUUID();
    const existing = await getMessageById(msgId);

    if (existing) {
        sendResponse(fromAddress, { type: 'ACK', id: msgId, status: 'delivered' });
        return;
    }

    const content = serializeContactCardMessage(data);
    const saved = await saveMessage(msgId, upeerId, false, content, undefined, signature, 'delivered', upeerId, data.timestamp);
    const isNew = typeof (saved as SaveMessageResult)?.changes === 'number' && (saved as SaveMessageResult)!.changes! > 0;

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