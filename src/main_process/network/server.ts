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
    getMyEphemeralPublicKeyHex,
    incrementEphemeralMessageCounter
} from '../security/identity.js';
import { AdaptivePow } from '../security/pow.js';
import { network, warn, error } from '../security/secure-logger.js';
import {
    canonicalStringify,
    getNetworkAddress
} from './utils.js';
import { handlePacket } from './handlers.js';
import { broadcastDhtUpdate as coreBroadcastDhtUpdate, sendDhtExchange, startDhtSearch } from './dht/core.js';
import { app } from 'electron';
import { KademliaDHT } from './dht/kademlia/index.js';
import { setKademliaInstance, performDhtMaintenance } from './dht/handlers.js';
import { fileTransferManager } from './file-transfer/index.js';



const YGG_PORT = 50005;
let udpSocket: dgram.Socket | null = null;
let mainWindow: BrowserWindow | null = null;
let kademliaDHT: KademliaDHT | null = null;

export function startUDPServer(win: BrowserWindow) {
    mainWindow = win;
    const networkAddr = getNetworkAddress();
    if (!networkAddr) return;

    udpSocket = dgram.createSocket({ type: 'udp6', reuseAddr: true });

    // Initialize file transfer manager
    fileTransferManager.initialize(sendSecureUDPMessage, win);

    // Initialize Kademlia DHT
    const userDataPath = app.getPath('userData');
    kademliaDHT = new KademliaDHT(getMyRevelNestId(), sendSecureUDPMessage, getContacts, userDataPath);
    setKademliaInstance(kademliaDHT);

    // Start DHT maintenance interval (every hour)
    setInterval(() => {
        if (kademliaDHT) {
            kademliaDHT.performMaintenance();
        }
        // performDhtMaintenance is now async, handle with catch
        performDhtMaintenance().catch(err => {
            console.error('DHT maintenance error:', err);
        });
    }, 3600000);

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
        error('UDP Error', err, 'network');
    });

    try {
        udpSocket.bind(YGG_PORT, networkAddr);
    } catch (e) {
        error('Failed to bind socket', e, 'network');
    }
}

export function sendSecureUDPMessage(ip: string, data: any) {
    if (!udpSocket) return;

    const myId = getMyRevelNestId();
    // Exclude certain fields from signature for backward compatibility and optional metadata
    const fieldsToExclude = ['contactCache', 'renewalToken'];
    const dataForSignature = { ...data };
    fieldsToExclude.forEach(field => {
        if (field in dataForSignature) {
            delete dataForSignature[field];
        }
    });
    const signature = sign(Buffer.from(canonicalStringify(dataForSignature)));
    const fullPacket = {
        ...data,
        senderRevelnestId: myId,
        signature: signature.toString('hex')
    };

    const buf = Buffer.from(JSON.stringify(fullPacket));

    // Debug logging for file transfers
    if (data.type === 'FILE_CHUNK' || data.type === 'FILE_START' || data.type === 'FILE_ACK') {
        console.log('DEBUG sendSecureUDPMessage:', {
            type: data.type,
            ip,
            port: YGG_PORT,
            fileId: data.fileId,
            chunkIndex: data.chunkIndex,
            timestamp: Date.now()
        });
    }

    udpSocket.send(buf, YGG_PORT, ip, (err) => {
        if (err) {
            error(`UDP send error to ${ip}`, err, 'network');
        }
    });
}

export async function sendContactRequest(targetIp: string, alias: string) {
    // Generate PoW proof for Sybil resistance (light proof for mobile compatibility)
    const powProof = AdaptivePow.generateLightProof(getMyRevelNestId());

    const data = {
        type: 'HANDSHAKE_REQ',
        publicKey: getMyPublicKeyHex(),
        ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
        alias: alias,
        powProof
    };
    sendSecureUDPMessage(targetIp, data);
}

export async function acceptContactRequest(revelnestId: string, publicKey: string) {
    const contact = await getContactByRevelnestId(revelnestId);
    if (!contact) return;

    updateContactPublicKey(revelnestId, publicKey);

    const data = {
        type: 'HANDSHAKE_ACCEPT',
        publicKey: getMyPublicKeyHex(),
        ephemeralPublicKey: getMyEphemeralPublicKeyHex()
    };
    sendSecureUDPMessage(contact.address, data);
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

    // Increment ephemeral message counter for Perfect Forward Secrecy
    if (useEphemeral) {
        incrementEphemeralMessageCounter();
    }

    const data = {
        type: 'CHAT',
        id: msgId,
        content: ciphertext.toString('hex'),
        nonce: nonce.toString('hex'),
        ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
        useRecipientEphemeral: useEphemeral,
        replyTo: replyTo
    };

    // Contact cache removed for privacy reasons - use DHT and renewal tokens instead
    // Previously: attached top contacts for extreme resilience
    // Now: relying on DHT persistence (30 days) and renewal tokens for resilience

    const signature = sign(Buffer.from(canonicalStringify(data)));
    const isToSelf = revelnestId === getMyRevelNestId();
    saveMessage(msgId, revelnestId, true, content, replyTo, signature.toString('hex'), isToSelf ? 'read' : 'sent');

    sendSecureUDPMessage(contact.address, data);

    setTimeout(async () => {
        const { getMessageStatus } = await import('../storage/db.js');
        const status = await getMessageStatus(msgId);
        if (status === 'sent') {
            warn('Message not delivered, starting reactive search', { msgId, revelnestId }, 'network');
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

            // Enhanced distributed heartbeat with contact cache exchange
            distributedHeartbeat(contact, sendSecureUDPMessage).catch(err => {
                warn('Distributed heartbeat failed', err, 'heartbeat');
            });
        }
    }
}

// ========================
// Distributed Heartbeat Protocol for Extreme Resilience
// ========================

async function distributedHeartbeat(contact: any, sendSecureUDPMessage: (ip: string, data: any) => void) {
    const myId = getMyRevelNestId();

    // 1. Exchange location blocks
    await exchangeLocationBlocks(contact, sendSecureUDPMessage);

    // 2. Exchange lists of alive contacts
    const aliveContacts = getContactsSeenLast24h();
    await sendContactList(contact, aliveContacts, sendSecureUDPMessage);

    // 3. Synchronize DHT (send blocks that need renewal)
    const blocksToShare = getLocationBlocksForRenewal();
    await shareBlocks(contact, blocksToShare, sendSecureUDPMessage);

    network('Distributed heartbeat completed', undefined, { contact: contact.revelnestId }, 'heartbeat');
}

async function exchangeLocationBlocks(contact: any, sendSecureUDPMessage: (ip: string, data: any) => void) {
    // Send our current location block
    const currentIp = getNetworkAddress();
    if (!currentIp) return;

    // Get our current DHT sequence
    const { incrementMyDhtSeq } = await import('../security/identity.js');
    const newSeq = incrementMyDhtSeq();

    // Generate location block with renewal token
    const { generateSignedLocationBlock, generateRenewalToken } = await import('./utils.js');
    const renewalToken = generateRenewalToken(contact.revelnestId);
    const locBlock = generateSignedLocationBlock(currentIp, newSeq, undefined, renewalToken);

    sendSecureUDPMessage(contact.address, {
        type: 'DHT_UPDATE',
        locationBlock: locBlock
    });
}

function getContactsSeenLast24h(): Array<{
    revelnestId: string;
    lastSeen: number;
    address: string;
}> {
    const allContacts = getContacts() as any[];
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);

    return allContacts
        .filter(c => c.lastSeen && c.lastSeen > cutoff && c.address)
        .map(c => ({
            revelnestId: c.revelnestId,
            lastSeen: c.lastSeen,
            address: c.address
        }));
}

async function sendContactList(contact: any, aliveContacts: any[], sendSecureUDPMessage: (ip: string, data: any) => void) {
    if (aliveContacts.length === 0) return;

    sendSecureUDPMessage(contact.address, {
        type: 'DHT_EXCHANGE',
        peers: aliveContacts.map(c => ({
            revelnestId: c.revelnestId,
            address: c.address,
            lastSeen: c.lastSeen
        }))
    });
}

function getLocationBlocksForRenewal(): Array<{
    revelnestId: string;
    locationBlock: any;
}> {
    const allContacts = getContacts() as any[];
    const now = Date.now();
    const renewalThreshold = 3 * 24 * 60 * 60 * 1000; // 3 days

    return allContacts
        .filter(c => c.dhtSignature && c.expiresAt)
        .filter(c => {
            const timeToExpire = c.expiresAt - now;
            return timeToExpire < renewalThreshold && timeToExpire > 0;
        })
        .map(c => ({
            revelnestId: c.revelnestId,
            locationBlock: {
                address: c.address,
                dhtSeq: c.dhtSeq,
                signature: c.dhtSignature,
                expiresAt: c.expiresAt
            }
        }));
}

async function shareBlocks(contact: any, blocksToShare: any[], sendSecureUDPMessage: (ip: string, data: any) => void) {
    if (blocksToShare.length === 0) return;

    // Share blocks that need renewal
    sendSecureUDPMessage(contact.address, {
        type: 'DHT_EXCHANGE',
        peers: blocksToShare
    });
}

export function wrappedBroadcastDhtUpdate() {
    coreBroadcastDhtUpdate(sendSecureUDPMessage);
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

    // Increment ephemeral message counter for Perfect Forward Secrecy
    if (useEphemeral) {
        incrementEphemeralMessageCounter();
    }

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

export async function sendFile(revelnestId: string, filePath: string, thumbnail?: string): Promise<string | undefined> {
    const contact = await getContactByRevelnestId(revelnestId);
    if (!contact || contact.status !== 'connected') return undefined;

    try {
        const fileId = await fileTransferManager.startSend(
            revelnestId,
            contact.address,
            filePath,
            thumbnail
        );
        return fileId;
    } catch (error) {
        warn('File transfer failed to start', { revelnestId, filePath, error }, 'file-transfer');
        return undefined;
    }
}

export function closeUDPServer() {
    if (udpSocket) udpSocket.close();
}

// Re-export specifically as needed
export { wrappedBroadcastDhtUpdate as broadcastDhtUpdate };
