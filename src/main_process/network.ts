import os from 'node:os';
import dgram from 'node:dgram';
import { BrowserWindow } from 'electron';
import {
    saveMessage,
    updateLastSeen,
    updateMessageStatus,
    getContactByRevelnestId,
    addOrUpdateContact,
    getContactByAddress,
    deleteContact,
    updateContactLocation,
    updateContactPublicKey
} from './database.js';
import crypto from 'node:crypto';
import { getMyPublicKeyHex, getMyRevelNestId, sign, verify } from './identity.js';

/**
 * Ensures JSON keys are always in the same order for consistent signatures.
 */
function canonicalStringify(obj: any): string {
    const allKeys = Object.keys(obj).sort();
    return JSON.stringify(obj, allKeys);
}

const YGG_PORT = 50005;
let udpSocket: dgram.Socket | null = null;
let mainWindow: BrowserWindow | null = null;

export function getNetworkAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        if (name.includes('ygg') || name === 'utun2' || name === 'tun0') {
            for (const net of interfaces[name] || []) {
                if (net.family === 'IPv6' && net.address.startsWith('200:')) {
                    return net.address;
                }
            }
        }
    }
    return null;
}

export function startUDPServer(win: BrowserWindow) {
    mainWindow = win;
    const networkAddr = getNetworkAddress();
    if (!networkAddr) return;

    udpSocket = dgram.createSocket({ type: 'udp6', reuseAddr: true });

    udpSocket.on('message', async (msg, rinfo) => {
        try {
            const fullPacket = JSON.parse(msg.toString());
            const { signature, senderRevelnestId, ...data } = fullPacket;

            // 1. HANDSHAKE (Discovery & Connection)
            if (data.type === 'HANDSHAKE_REQ') {
                console.log(`[Handshake] Solicitud de ${rinfo.address}: ${data.revelnestId}`);

                addOrUpdateContact(data.revelnestId, rinfo.address, data.alias || `Peer ${data.revelnestId.slice(0, 4)}`, undefined, 'incoming');

                mainWindow?.webContents.send('contact-request-received', {
                    revelnestId: data.revelnestId,
                    address: rinfo.address,
                    alias: data.alias,
                    publicKey: data.publicKey
                });
                return;
            }

            if (data.type === 'HANDSHAKE_ACCEPT') {
                console.log(`[Handshake] ACEPTADA de ${rinfo.address}: ${data.revelnestId}`);

                // Limpieza de fantasmas: Borramos cualquier rastro previo de esta IP si era un temporal
                const ghost = await getContactByAddress(rinfo.address);
                if (ghost && ghost.revelnestId.startsWith('pending-')) {
                    deleteContact(ghost.revelnestId);
                }

                const existing = await getContactByRevelnestId(data.revelnestId);
                if (existing && existing.status === 'pending') {
                    updateContactPublicKey(data.revelnestId, data.publicKey);
                    mainWindow?.webContents.send('contact-handshake-finished', { revelnestId: data.revelnestId });
                }
                return;
            }

            // 2. SECURITY CHECK
            const revelnestId = senderRevelnestId;
            if (!revelnestId) return;

            const contact = await getContactByRevelnestId(revelnestId);
            if (!contact || contact.status !== 'connected' || !contact.publicKey) {
                console.warn(`[Security] Origen no conectado o sin llave: ${revelnestId}`);
                return;
            }

            const verified = verify(
                Buffer.from(canonicalStringify(data)),
                Buffer.from(signature, 'hex'),
                Buffer.from(contact.publicKey, 'hex')
            );

            if (!verified) {
                console.error(`[Security] Firma INVÁLIDA de ${revelnestId}.`);
                return;
            }

            // 3. SOVEREIGN ROAMING
            if (contact.address !== rinfo.address) {
                updateContactLocation(revelnestId, rinfo.address);
            }

            const nowIso = new Date().toISOString();
            updateLastSeen(revelnestId);
            mainWindow?.webContents.send('contact-presence', { revelnestId: revelnestId, lastSeen: nowIso });

            // 4. CHAT LOGIC
            if (data.type === 'PING') {
                sendSecureUDPMessage(rinfo.address, { type: 'PONG' });
            } else if (data.type === 'CHAT') {
                const msgId = data.id || crypto.randomUUID();
                saveMessage(msgId, revelnestId, false, data.content, data.replyTo, signature);
                mainWindow?.webContents.send('receive-p2p-message', {
                    id: msgId,
                    revelnestId: revelnestId,
                    isMine: false,
                    message: data.content,
                    replyTo: data.replyTo,
                    status: 'received'
                });
                sendSecureUDPMessage(rinfo.address, { type: 'ACK', id: msgId });
            } else if (data.type === 'ACK') {
                if (data.id) {
                    updateMessageStatus(data.id, 'delivered');
                    mainWindow?.webContents.send('message-delivered', { id: data.id, revelnestId: revelnestId });
                }
            } else if (data.type === 'READ') {
                if (data.id) {
                    updateMessageStatus(data.id, 'read');
                    mainWindow?.webContents.send('message-read', { id: data.id, revelnestId: revelnestId });
                }
            } else if (data.type === 'TYPING') {
                mainWindow?.webContents.send('peer-typing', { revelnestId: revelnestId });
            }
        } catch (e) {
            console.error('UDP Packet Error:', e);
        }
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

export async function sendContactRequest(targetIp: string, alias: string) {
    const data = {
        type: 'HANDSHAKE_REQ',
        revelnestId: getMyRevelNestId(),
        publicKey: getMyPublicKeyHex(),
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
        publicKey: getMyPublicKeyHex()
    };

    const buf = Buffer.from(JSON.stringify(data));
    if (udpSocket) {
        udpSocket.send(buf, YGG_PORT, contact.address);
    }
}

function sendSecureUDPMessage(ip: string, data: any) {
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

export function sendUDPMessage(revelnestId: string, message: string | { [key: string]: any }, replyTo?: string): string | undefined {
    const msgId = crypto.randomUUID();
    const content = typeof message === 'string' ? message : (message as any).content;

    const contact = getContactByRevelnestId(revelnestId);
    if (!contact || contact.status !== 'connected') return undefined;

    const data = {
        type: 'CHAT',
        id: msgId,
        content: content,
        replyTo: replyTo
    };

    const signature = sign(Buffer.from(canonicalStringify(data)));
    saveMessage(msgId, revelnestId, true, content, replyTo, signature.toString('hex'));

    sendSecureUDPMessage(contact.address, data);
    return msgId;
}

export function checkHeartbeat(contacts: any[]) {
    for (const contact of contacts) {
        if (contact.status === 'connected') {
            sendSecureUDPMessage(contact.address, { type: 'PING' });
        }
    }
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

export function closeUDPServer() {
    if (udpSocket) udpSocket.close();
}
