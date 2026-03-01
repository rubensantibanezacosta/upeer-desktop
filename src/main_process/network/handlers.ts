import { BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import {
    saveMessage,
    updateLastSeen,
    updateMessageStatus,
    getContactByRevelnestId,
    addOrUpdateContact,
    getContactByAddress,
    deleteContact,
    updateContactLocation,
    updateContactPublicKey,
    updateContactEphemeralPublicKey,
    updateContactDhtLocation,
    getContacts,
    saveReaction,
    deleteReaction,
    updateMessageContent,
    deleteMessageLocally
} from '../storage/db.js';
import {
    getMyRevelNestId,
    decrypt,
    verify
} from '../security/identity.js';
import { canonicalStringify, verifyLocationBlock } from './utils.js';

export async function handlePacket(
    msg: Buffer,
    rinfo: { address: string },
    win: BrowserWindow | null,
    sendResponse: (ip: string, data: any) => void,
    startDhtSearch: (revelnestId: string) => void
) {
    try {
        const fullPacket = JSON.parse(msg.toString());
        const { signature, senderRevelnestId, ...data } = fullPacket;

        // 1. HANDSHAKE (Discovery & Connection)
        if (data.type === 'HANDSHAKE_REQ') {
            console.log(`[Handshake] Solicitud de ${rinfo.address}: ${data.revelnestId}`);

            addOrUpdateContact(data.revelnestId, rinfo.address, data.alias || `Peer ${data.revelnestId.slice(0, 4)}`, data.publicKey, 'incoming', data.ephemeralPublicKey);

            win?.webContents.send('contact-request-received', {
                revelnestId: data.revelnestId,
                address: rinfo.address,
                alias: data.alias,
                publicKey: data.publicKey,
                ephemeralPublicKey: data.ephemeralPublicKey
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
                if (data.ephemeralPublicKey) {
                    updateContactEphemeralPublicKey(data.revelnestId, data.ephemeralPublicKey);
                }
                win?.webContents.send('contact-handshake-finished', { revelnestId: data.revelnestId });
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
        win?.webContents.send('contact-presence', { revelnestId: revelnestId, lastSeen: nowIso });

        // 4. CHAT & DHT LOGIC
        switch (data.type) {
            case 'DHT_UPDATE':
                handleDhtUpdate(revelnestId, contact, data);
                break;
            case 'DHT_EXCHANGE':
                handleDhtExchange(revelnestId, data);
                break;
            case 'DHT_QUERY':
                handleDhtQuery(revelnestId, data, rinfo.address, sendResponse);
                break;
            case 'DHT_RESPONSE':
                handleDhtResponse(revelnestId, data, sendResponse);
                break;
            case 'PING':
                sendResponse(rinfo.address, { type: 'PONG' });
                break;
            case 'CHAT':
                handleChatMessage(revelnestId, contact, data, win, signature, rinfo.address, sendResponse);
                break;
            case 'ACK':
                handleAck(revelnestId, data, win);
                break;
            case 'READ':
                handleReadReceipt(revelnestId, data, win);
                break;
            case 'TYPING':
                win?.webContents.send('peer-typing', { revelnestId: revelnestId });
                break;
            case 'CHAT_REACTION':
                handleIncomingReaction(revelnestId, data, win);
                break;
            case 'CHAT_UPDATE':
                handleIncomingUpdate(revelnestId, contact, data, win, signature);
                break;
            case 'CHAT_DELETE':
                handleIncomingDelete(revelnestId, data, win);
                break;
            default:
                console.warn(`[Network] Paquete desconocido de ${revelnestId}: ${data.type}`);
        }
    } catch (e) {
        console.error('UDP Packet Error:', e);
    }
}

async function handleDhtUpdate(revelnestId: string, contact: any, data: any) {
    const block = data.locationBlock;
    if (!block || typeof block.dhtSeq !== 'number' || !block.address || !block.signature) return;

    const isValid = verifyLocationBlock(revelnestId, block, contact.publicKey);
    if (!isValid) {
        console.error(`[DHT Security] Invalid DHT_UPDATE signature from ${revelnestId}`);
        return;
    }

    if (block.dhtSeq > (contact.dhtSeq || 0)) {
        console.log(`[DHT] Actualizando ubicación de ${revelnestId} a ${block.address} (Seq: ${block.dhtSeq})`);
        updateContactDhtLocation(revelnestId, block.address, block.dhtSeq, block.signature);
    }
}

async function handleDhtExchange(revelnestId: string, data: any) {
    if (!Array.isArray(data.peers)) return;
    console.log(`[DHT PEEREX] Recibiendo ${data.peers.length} ubicaciones de ${revelnestId}`);

    for (const peer of data.peers) {
        if (!peer.revelnestId || !peer.publicKey || !peer.locationBlock) continue;
        if (peer.revelnestId === getMyRevelNestId()) continue;

        const existing = await getContactByRevelnestId(peer.revelnestId);
        if (!existing) continue;

        const block = peer.locationBlock;
        if (typeof block.dhtSeq !== 'number' || !block.address || !block.signature) continue;

        const isValid = verifyLocationBlock(peer.revelnestId, block, existing.publicKey);
        if (!isValid) {
            console.error(`[DHT Security] Invalid PEEREX signature for ${peer.revelnestId}`);
            continue;
        }

        if (block.dhtSeq > (existing.dhtSeq || 0)) {
            updateContactDhtLocation(peer.revelnestId, block.address, block.dhtSeq, block.signature);
        }
    }
}

async function handleDhtQuery(revelnestId: string, data: any, fromAddress: string, sendResponse: (ip: string, data: any) => void) {
    console.log(`[DHT Query] Buscando ${data.targetId} a petición de ${revelnestId}`);
    const target = await getContactByRevelnestId(data.targetId);

    let responseData: any = { type: 'DHT_RESPONSE', targetId: data.targetId };

    if (target && target.status === 'connected' && target.dhtSignature) {
        responseData.locationBlock = {
            address: target.address,
            dhtSeq: target.dhtSeq,
            signature: target.dhtSignature
        };
        responseData.publicKey = target.publicKey;
    } else {
        const allContacts = getContacts() as any[];
        const distanceXOR = (idA: string, idB: string) => {
            try { return BigInt('0x' + idA) ^ BigInt('0x' + idB); }
            catch { return BigInt(0); }
        };

        const closest = allContacts
            .filter(c => c.status === 'connected' && c.revelnestId !== revelnestId)
            .map(c => ({
                revelnestId: c.revelnestId,
                publicKey: c.publicKey,
                locationBlock: { address: c.address, dhtSeq: c.dhtSeq, signature: c.dhtSignature },
                dist: distanceXOR(c.revelnestId, data.targetId)
            }))
            .sort((a, b) => (a.dist < b.dist ? -1 : a.dist > b.dist ? 1 : 0))
            .slice(0, 5)
            .map(({ dist, ...d }) => d);

        responseData.neighbors = closest;
    }
    sendResponse(fromAddress, responseData);
}

async function handleDhtResponse(revelnestId: string, data: any, sendResponse: (ip: string, data: any) => void) {
    if (data.locationBlock) {
        const block = data.locationBlock;
        const existing = await getContactByRevelnestId(data.targetId);
        if (!existing) return;

        const isValid = verifyLocationBlock(data.targetId, block, existing.publicKey || data.publicKey);
        if (isValid && block.dhtSeq > (existing.dhtSeq || 0)) {
            console.log(`[DHT Search] ¡ENCONTRADO! Nueva IP para ${data.targetId}: ${block.address}`);
            updateContactDhtLocation(data.targetId, block.address, block.dhtSeq, block.signature);
        }
    } else if (data.neighbors) {
        console.log(`[DHT Search] Recibidos ${data.neighbors.length} referidos de ${revelnestId} para buscar a ${data.targetId}`);
        for (const peer of data.neighbors) {
            if (peer.revelnestId === getMyRevelNestId()) continue;
            const existing = await getContactByRevelnestId(peer.revelnestId);
            if (!existing) {
                if (peer.locationBlock?.address) {
                    sendResponse(peer.locationBlock.address, { type: 'DHT_QUERY', targetId: data.targetId });
                }
            } else if (peer.locationBlock?.dhtSeq > (existing.dhtSeq || 0)) {
                updateContactDhtLocation(peer.revelnestId, peer.locationBlock.address, peer.locationBlock.dhtSeq, peer.locationBlock.signature);
                sendResponse(peer.locationBlock.address, { type: 'DHT_QUERY', targetId: data.targetId });
            }
        }
    }
}

async function handleChatMessage(
    revelnestId: string,
    contact: any,
    data: any,
    win: BrowserWindow | null,
    signature: any,
    fromAddress: string,
    sendResponse: (ip: string, data: any) => void
) {
    const msgId = data.id || crypto.randomUUID();

    if (data.ephemeralPublicKey) {
        updateContactEphemeralPublicKey(revelnestId, data.ephemeralPublicKey);
    }

    let displayContent = data.content;
    if (data.nonce) {
        try {
            const senderKeyHex = data.useRecipientEphemeral ? data.ephemeralPublicKey : contact.publicKey;
            const useEphemeral = !!data.useRecipientEphemeral;
            if (!senderKeyHex) throw new Error("La llave pública del remitente no está disponible para descifrar");

            const decrypted = decrypt(
                Buffer.from(data.content, 'hex'),
                Buffer.from(data.nonce, 'hex'),
                Buffer.from(senderKeyHex, 'hex'),
                useEphemeral
            );
            if (decrypted) {
                displayContent = decrypted.toString('utf-8');
            } else {
                displayContent = "🔒 [Error de descifrado]";
            }
        } catch (err) {
            displayContent = "🔒 [Error crítico de seguridad]";
            console.error('Decryption failed:', err);
        }
    }

    saveMessage(msgId, revelnestId, false, displayContent, data.replyTo, signature);
    win?.webContents.send('receive-p2p-message', {
        id: msgId,
        revelnestId: revelnestId,
        isMine: false,
        message: displayContent,
        replyTo: data.replyTo,
        status: 'received',
        encrypted: !!data.nonce
    });
    sendResponse(fromAddress, { type: 'ACK', id: msgId });
}

function handleAck(revelnestId: string, data: any, win: BrowserWindow | null) {
    if (data.id) {
        updateMessageStatus(data.id, 'delivered');
        win?.webContents.send('message-delivered', { id: data.id, revelnestId: revelnestId });
    }
}

function handleReadReceipt(revelnestId: string, data: any, win: BrowserWindow | null) {
    if (data.id) {
        updateMessageStatus(data.id, 'read');
        win?.webContents.send('message-read', { id: data.id, revelnestId: revelnestId });
    }
}

async function handleIncomingReaction(revelnestId: string, data: any, win: BrowserWindow | null) {
    const { msgId, emoji, remove } = data;
    if (remove) {
        deleteReaction(msgId, revelnestId, emoji);
    } else {
        saveReaction(msgId, revelnestId, emoji);
    }
    win?.webContents.send('message-reaction-updated', { msgId, revelnestId, emoji, remove });
}

async function handleIncomingUpdate(revelnestId: string, contact: any, data: any, win: BrowserWindow | null, signature: any) {
    const { msgId, content, nonce, ephemeralPublicKey, useRecipientEphemeral } = data;
    let displayContent = content;

    if (nonce) {
        const senderKeyHex = useRecipientEphemeral ? ephemeralPublicKey : contact.publicKey;
        const decrypted = decrypt(
            Buffer.from(content, 'hex'),
            Buffer.from(nonce, 'hex'),
            Buffer.from(senderKeyHex, 'hex'),
            !!useRecipientEphemeral
        );
        if (decrypted) displayContent = decrypted.toString('utf-8');
    }

    updateMessageContent(msgId, displayContent, signature);
    win?.webContents.send('message-updated', { id: msgId, revelnestId, content: displayContent });
}

async function handleIncomingDelete(revelnestId: string, data: any, win: BrowserWindow | null) {
    const { msgId } = data;
    deleteMessageLocally(msgId);
    win?.webContents.send('message-deleted', { id: msgId, revelnestId });
}
