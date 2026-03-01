import dgram from 'node:dgram';
import crypto from 'node:crypto';
import { BrowserWindow } from 'electron';
import {
    saveMessage,
    updateMessageStatus,
    getContactByRevelnestId,
    updateContactPublicKey,
    getContacts,
    saveReaction,
    deleteReaction,
    updateMessageContent,
    deleteMessageLocally
} from '../storage/db.js';
import {
    getMyPublicKeyHex,
    getMyRevelNestId,
    sign,
    encrypt,
    getMyEphemeralPublicKeyHex
} from '../security/identity.js';
import {
    canonicalStringify,
    getNetworkAddress
} from './utils.js';
import { handlePacket } from './handlers.js';
import { broadcastDhtUpdate, sendDhtExchange, startDhtSearch } from './dht.js';

const YGG_PORT = 50005;
let udpSocket: dgram.Socket | null = null;
let mainWindow: BrowserWindow | null = null;

export function startUDPServer(win: BrowserWindow) {
    mainWindow = win;
    const networkAddr = getNetworkAddress();
    if (!networkAddr) return;

    udpSocket = dgram.createSocket({ type: 'udp6', reuseAddr: true });

    udpSocket.on('message', async (msg, rinfo) => {
        await handlePacket(
            msg,
            rinfo,
            mainWindow,
            sendSecureUDPMessage,
            (rid) => startDhtSearch(rid, sendSecureUDPMessage)
        );
    });

    udpSocket.on('error', (err) => {
        console.error('UDP Error:', err);
    });

    try {
        udpSocket.bind(YGG_PORT, networkAddr);
    } catch (e) {
        console.error('Failed to bind socket:', e);
    }
}

export function sendSecureUDPMessage(ip: string, data: any) {
    if (!udpSocket) return;

    const myId = getMyRevelNestId();
    const signature = sign(Buffer.from(canonicalStringify(data)));
    const fullPacket = {
        ...data,
        senderRevelnestId: myId,
        signature: signature.toString('hex')
    };

    const buf = Buffer.from(JSON.stringify(fullPacket));
    udpSocket.send(buf, YGG_PORT, ip);
}

export async function sendContactRequest(targetIp: string, alias: string) {
    const data = {
        type: 'HANDSHAKE_REQ',
        revelnestId: getMyRevelNestId(),
        publicKey: getMyPublicKeyHex(),
        ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
        alias: alias
    };

    const buf = Buffer.from(JSON.stringify(data));
    if (udpSocket) {
        udpSocket.send(buf, YGG_PORT, targetIp);
    }
}

export async function acceptContactRequest(revelnestId: string, publicKey: string) {
    const contact = await getContactByRevelnestId(revelnestId);
    if (!contact) return;

    updateContactPublicKey(revelnestId, publicKey);

    const data = {
        type: 'HANDSHAKE_ACCEPT',
        revelnestId: getMyRevelNestId(),
        publicKey: getMyPublicKeyHex(),
        ephemeralPublicKey: getMyEphemeralPublicKeyHex()
    };

    const buf = Buffer.from(JSON.stringify(data));
    if (udpSocket) {
        udpSocket.send(buf, YGG_PORT, contact.address);
    }
}

export async function sendUDPMessage(revelnestId: string, message: string | { [key: string]: any }, replyTo?: string): Promise<string | undefined> {
    const msgId = crypto.randomUUID();
    const content = typeof message === 'string' ? message : (message as any).content;

    const contact = await getContactByRevelnestId(revelnestId);
    if (!contact || contact.status !== 'connected' || !contact.publicKey) return undefined;

    const useEphemeral = !!contact.ephemeralPublicKey;
    const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;

    const { ciphertext, nonce } = encrypt(
        Buffer.from(content, 'utf-8'),
        Buffer.from(targetKeyHex, 'hex'),
        useEphemeral
    );

    const data = {
        type: 'CHAT',
        id: msgId,
        content: ciphertext.toString('hex'),
        nonce: nonce.toString('hex'),
        ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
        useRecipientEphemeral: useEphemeral,
        replyTo: replyTo
    };

    const signature = sign(Buffer.from(canonicalStringify(data)));
    saveMessage(msgId, revelnestId, true, content, replyTo, signature.toString('hex'));

    sendSecureUDPMessage(contact.address, data);

    setTimeout(async () => {
        const { getMessageStatus } = await import('../storage/db.js');
        const status = await getMessageStatus(msgId);
        if (status === 'sent') {
            console.warn(`[Network] Mensaje ${msgId} no entregado a ${revelnestId}. Iniciando búsqueda reactiva...`);
            startDhtSearch(revelnestId, sendSecureUDPMessage);
        }
    }, 5000);

    return msgId;
}

export function checkHeartbeat(contacts: any[]) {
    for (const contact of contacts) {
        if (contact.status === 'connected') {
            sendSecureUDPMessage(contact.address, { type: 'PING' });
            sendDhtExchange(contact.revelnestId, sendSecureUDPMessage);
        }
    }
}

export function wrappedBroadcastDhtUpdate() {
    broadcastDhtUpdate(sendSecureUDPMessage);
}

export function sendTypingIndicator(revelnestId: string) {
    const contact = getContactByRevelnestId(revelnestId);
    if (contact && contact.status === 'connected') sendSecureUDPMessage(contact.address, { type: 'TYPING' });
}

export function sendReadReceipt(revelnestId: string, id: string) {
    updateMessageStatus(id, 'read');
    const contact = getContactByRevelnestId(revelnestId);
    if (contact && contact.status === 'connected') sendSecureUDPMessage(contact.address, { type: 'READ', id });
}

export function sendContactCard(targetRevelnestId: string, contact: any) {
    const targetContact = getContactByRevelnestId(targetRevelnestId);
    if (!targetContact || targetContact.status !== 'connected') return undefined;

    const msgId = crypto.randomUUID();
    const data = {
        type: 'CHAT_CONTACT',
        id: msgId,
        contactName: contact.name,
        contactAddress: contact.address,
        revelnestId: contact.revelnestId,
        contactPublicKey: contact.publicKey
    };

    const signature = sign(Buffer.from(canonicalStringify(data)));
    saveMessage(msgId, targetRevelnestId, true, `CONTACT_CARD|${contact.name}`, undefined, signature.toString('hex'));

    sendSecureUDPMessage(targetContact.address, data);
    return msgId;
}

export async function sendChatReaction(revelnestId: string, msgId: string, emoji: string, remove: boolean) {
    const contact = await getContactByRevelnestId(revelnestId);
    if (!contact || contact.status !== 'connected') return;

    if (remove) deleteReaction(msgId, getMyRevelNestId(), emoji);
    else saveReaction(msgId, getMyRevelNestId(), emoji);

    const data = { type: 'CHAT_REACTION', msgId, emoji, remove };
    sendSecureUDPMessage(contact.address, data);
}

export async function sendChatUpdate(revelnestId: string, msgId: string, newContent: string) {
    const contact = await getContactByRevelnestId(revelnestId);
    if (!contact || contact.status !== 'connected' || !contact.publicKey) return;

    const useEphemeral = !!contact.ephemeralPublicKey;
    const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;

    const { ciphertext, nonce } = encrypt(
        Buffer.from(newContent, 'utf-8'),
        Buffer.from(targetKeyHex, 'hex'),
        useEphemeral
    );

    const data = {
        type: 'CHAT_UPDATE',
        msgId,
        content: ciphertext.toString('hex'),
        nonce: nonce.toString('hex'),
        ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
        useRecipientEphemeral: useEphemeral
    };

    const signature = sign(Buffer.from(canonicalStringify(data)));
    updateMessageContent(msgId, newContent, signature.toString('hex'));
    sendSecureUDPMessage(contact.address, data);
}

export async function sendChatDelete(revelnestId: string, msgId: string) {
    const contact = await getContactByRevelnestId(revelnestId);
    if (!contact || contact.status !== 'connected') return;

    deleteMessageLocally(msgId);
    const data = { type: 'CHAT_DELETE', msgId };
    sendSecureUDPMessage(contact.address, data);
}

export function closeUDPServer() {
    if (udpSocket) udpSocket.close();
}

// Re-export specifically as needed
export { wrappedBroadcastDhtUpdate as broadcastDhtUpdate };
