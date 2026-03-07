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
    deleteMessageLocally,
    // updateContactFromCache
} from '../storage/db.js';
import {
    getMyRevelNestId,
    decrypt,
    verify,
    getRevelNestIdFromPublicKey
} from '../security/identity.js';
import { AdaptivePow } from '../security/pow.js';
import { canonicalStringify, verifyLocationBlock } from './utils.js';
import { handleDhtPacket } from './dht/handlers.js';
import { fileTransferManager } from './file-transfer/index.js';
import { IdentityRateLimiter } from '../security/identity-rate-limiter.js';
import { getReputationSystem, ActivityType } from '../security/reputation.js';
import { validateMessage } from '../security/validation.js';
import { network, security, warn, error, debug } from '../security/secure-logger.js';

// Global rate limiter instance
const rateLimiter = new IdentityRateLimiter();

export async function handlePacket(
    msg: Buffer,
    rinfo: { address: string; port: number },
    win: BrowserWindow | null,
    sendResponse: (ip: string, data: any) => void,
    startDhtSearch: (revelnestId: string) => void
) {
    try {
        const fullPacket = JSON.parse(msg.toString());
        const { signature, senderRevelnestId, ...data } = fullPacket;

        console.log('DEBUG handlePacket - RAW PACKET ARRIVED:', {
            type: data.type,
            fromAddress: rinfo.address,
            fromPort: rinfo.port,
            size: msg.length,
            hasSignature: !!signature,
            hasSenderId: !!senderRevelnestId,
            timestamp: Date.now()
        });

        // Special logging for FILE_CHUNK to debug missing chunk 0
        if (data.type === 'FILE_CHUNK') {
            console.log('DEBUG handlePacket - FILE_CHUNK RAW:', {
                fileId: data.fileId,
                chunkIndex: data.chunkIndex,
                totalChunks: data.totalChunks,
                fromAddress: rinfo.address,
                dataSize: data.data?.length,
                signatureLength: signature?.length,
                timestamp: Date.now()
            });
        }

        // Rate limiting check
        if (!data.type || typeof data.type !== 'string') {
            security('Packet missing type', { ip: rinfo.address }, 'network');
            return;
        }

        if (!rateLimiter.checkIp(rinfo.address, data.type)) {
            console.log('DEBUG handlePacket - IP RATE LIMITED:', {
                type: data.type,
                ip: rinfo.address,
                fileId: data.fileId,
                chunkIndex: data.chunkIndex,
                timestamp: Date.now()
            });
            // Silently drop packet when rate limited
            return;
        }

        // Input validation
        const validation = validateMessage(data.type, data);
        if (!validation.valid) {
            security('Invalid message', { ip: rinfo.address, type: data.type, error: validation.error }, 'network');
            return;
        }

        // 1. HANDSHAKE (Discovery & Connection) with signature verification
        if (data.type === 'HANDSHAKE_REQ') {
            // Verify signature using provided public key
            if (!signature || !senderRevelnestId || !data.publicKey) {
                security('HANDSHAKE_REQ missing required fields', { ip: rinfo.address }, 'network');
                return;
            }

            // Exclude fields that are not part of the signature
            const fieldsToExclude = ['contactCache', 'renewalToken'];
            const dataForVerification = { ...data };
            fieldsToExclude.forEach(field => {
                if (field in dataForVerification) {
                    delete dataForVerification[field];
                }
            });
            const isValidSignature = verify(
                Buffer.from(canonicalStringify(dataForVerification)),
                Buffer.from(signature, 'hex'),
                Buffer.from(data.publicKey, 'hex')
            );

            if (!isValidSignature) {
                security('Invalid HANDSHAKE_REQ signature', { ip: rinfo.address }, 'network');
                return;
            }

            // Verify senderRevelnestId matches derived ID from public key
            const derivedId = getRevelNestIdFromPublicKey(Buffer.from(data.publicKey, 'hex'));
            if (derivedId !== senderRevelnestId) {
                security('HANDSHAKE_REQ ID mismatch', { ip: rinfo.address, expected: derivedId, received: senderRevelnestId }, 'network');
                return;
            }

            network('Handshake request verified', rinfo.address, { revelnestId: senderRevelnestId }, 'handshake');

            // Apply identity-based rate limiting
            if (!rateLimiter.checkIdentity(rinfo.address, senderRevelnestId, data.type)) {
                // Silently drop packet when rate limited (already logged by rate limiter)
                return;
            }

            // Check if contact already exists
            const existingContact = await getContactByRevelnestId(senderRevelnestId);
            const isNewContact = !existingContact;

            // Require PoW for new contacts (Sybil resistance)
            if (isNewContact) {
                if (!data.powProof) {
                    security('New contact requires PoW proof', { revelnestId: senderRevelnestId, ip: rinfo.address }, 'pow');
                    return;
                }
                if (!AdaptivePow.verifyLightProof(data.powProof, senderRevelnestId)) {
                    security('Invalid PoW proof from new contact', { revelnestId: senderRevelnestId, ip: rinfo.address }, 'pow');
                    return;
                }
                security('PoW verified for new contact', { revelnestId: senderRevelnestId, ip: rinfo.address }, 'pow');
            }

            // Social reputation system integration
            const reputation = getReputationSystem();
            const myId = getMyRevelNestId();

            // Add connection to social graph
            reputation.addConnection(myId, senderRevelnestId);
            reputation.logActivity(senderRevelnestId, ActivityType.HANDSHAKE_COMPLETED, { source: 'incoming' });

            // Check if contact is likely Sybil
            const isSybil = reputation.isLikelySybil(senderRevelnestId);
            if (isSybil) {
                security('Potential Sybil contact detected', { revelnestId: senderRevelnestId, ip: rinfo.address }, 'reputation');
                win?.webContents.send('contact-untrustworthy', {
                    revelnestId: senderRevelnestId,
                    address: rinfo.address,
                    alias: data.alias,
                    reason: 'low_reputation'
                });
            }

            const isAlreadyConnected = existingContact?.status === 'connected';
            const newStatus = isAlreadyConnected ? 'connected' : 'incoming';
            const alias = data.alias || existingContact?.name || `Peer ${senderRevelnestId.slice(0, 4)}`;

            addOrUpdateContact(senderRevelnestId, rinfo.address, alias, data.publicKey, newStatus, data.ephemeralPublicKey);

            if (isAlreadyConnected) {
                // If they re-request connection but are already accepted, silently accept and refresh presence
                win?.webContents.send('contact-presence', { revelnestId: senderRevelnestId, lastSeen: new Date().toISOString() });

                import('./server.js').then(({ acceptContactRequest }) => {
                    acceptContactRequest(senderRevelnestId, data.publicKey);
                }).catch(err => error('Failed to auto-accept known contact', err, 'network'));
                return;
            }

            win?.webContents.send('contact-request-received', {
                revelnestId: senderRevelnestId,
                address: rinfo.address,
                alias: data.alias,
                publicKey: data.publicKey,
                ephemeralPublicKey: data.ephemeralPublicKey
            });
            return;
        }

        if (data.type === 'HANDSHAKE_ACCEPT') {
            // Verify signature using provided public key
            if (!signature || !senderRevelnestId || !data.publicKey) {
                security('HANDSHAKE_ACCEPT missing required fields', { ip: rinfo.address }, 'network');
                return;
            }

            const isValidSignature = verify(
                Buffer.from(canonicalStringify(data)),
                Buffer.from(signature, 'hex'),
                Buffer.from(data.publicKey, 'hex')
            );

            if (!isValidSignature) {
                security('Invalid HANDSHAKE_ACCEPT signature', { ip: rinfo.address }, 'network');
                return;
            }

            // Verify senderRevelnestId matches derived ID from public key
            const derivedId = getRevelNestIdFromPublicKey(Buffer.from(data.publicKey, 'hex'));
            if (derivedId !== senderRevelnestId) {
                security('HANDSHAKE_ACCEPT ID mismatch', { ip: rinfo.address, expected: derivedId, received: senderRevelnestId }, 'network');
                return;
            }

            network('Handshake accepted verified', rinfo.address, { revelnestId: senderRevelnestId }, 'handshake');

            // Apply identity-based rate limiting
            if (!rateLimiter.checkIdentity(rinfo.address, senderRevelnestId, data.type)) {
                // Silently drop packet when rate limited (already logged by rate limiter)
                return;
            }

            // Limpieza de fantasmas: Borramos cualquier rastro previo de esta IP si era un temporal
            const ghost = await getContactByAddress(rinfo.address);
            if (ghost && ghost.revelnestId.startsWith('pending-')) {
                deleteContact(ghost.revelnestId);
            }

            const existing = await getContactByRevelnestId(senderRevelnestId);
            if (existing && existing.status === 'pending') {
                updateContactPublicKey(senderRevelnestId, data.publicKey);
                if (data.ephemeralPublicKey) {
                    updateContactEphemeralPublicKey(senderRevelnestId, data.ephemeralPublicKey);
                }
                win?.webContents.send('contact-handshake-finished', { revelnestId: senderRevelnestId });
            }
            return;
        }

        // 2. SECURITY CHECK
        const revelnestId = senderRevelnestId;
        if (!revelnestId) return;

        const contact = await getContactByRevelnestId(revelnestId);
        if (!contact || contact.status !== 'connected' || !contact.publicKey) {
            console.log('DEBUG handlePacket - CONTACT VALIDATION FAILED:', {
                type: data.type,
                fileId: data.fileId,
                chunkIndex: data.chunkIndex,
                revelnestId,
                hasContact: !!contact,
                contactStatus: contact?.status,
                hasPublicKey: !!contact?.publicKey,
                timestamp: Date.now()
            });
            security('Origin not connected or missing key', { revelnestId, ip: rinfo.address }, 'network');
            return;
        }

        // Debug logging for FILE_CHUNK
        if (data.type === 'FILE_CHUNK') {
            console.log('DEBUG handlePacket - FILE_CHUNK BEFORE SIGNATURE VERIFICATION:', {
                fileId: data.fileId,
                chunkIndex: data.chunkIndex,
                hasContact: !!contact,
                contactStatus: contact?.status,
                hasPublicKey: !!contact?.publicKey,
                signatureLength: signature?.length,
                timestamp: Date.now()
            });
        }

        // Exclude fields that are not part of the signature
        const fieldsToExclude = ['contactCache', 'renewalToken'];
        const dataForVerification = { ...data };
        fieldsToExclude.forEach(field => {
            if (field in dataForVerification) {
                delete dataForVerification[field];
            }
        });
        const verified = verify(
            Buffer.from(canonicalStringify(dataForVerification)),
            Buffer.from(signature, 'hex'),
            Buffer.from(contact.publicKey, 'hex')
        );

        if (!verified) {
            console.log('DEBUG handlePacket - SIGNATURE VERIFICATION FAILED:', {
                type: data.type,
                fileId: data.fileId,
                chunkIndex: data.chunkIndex,
                revelnestId,
                timestamp: Date.now()
            });
            security('Invalid signature', { revelnestId, ip: rinfo.address }, 'network');
            return;
        } else if (data.type === 'FILE_CHUNK') {
            console.log('DEBUG handlePacket - FILE_CHUNK SIGNATURE VERIFIED:', {
                fileId: data.fileId,
                chunkIndex: data.chunkIndex,
                revelnestId,
                timestamp: Date.now()
            });
        }

        // Apply identity-based rate limiting
        if (!rateLimiter.checkIdentity(rinfo.address, revelnestId, data.type)) {
            console.log('DEBUG handlePacket - RATE LIMITED:', {
                type: data.type,
                fileId: data.fileId,
                chunkIndex: data.chunkIndex,
                revelnestId,
                ip: rinfo.address,
                timestamp: Date.now()
            });
            // Silently drop packet when rate limited (already logged by rate limiter)
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
        // First, try to handle DHT messages with the new Kademlia handler
        if (data.type.startsWith('DHT_')) {
            const handled = await handleDhtPacket(
                data.type,
                data,
                revelnestId,
                rinfo.address,
                win,
                sendResponse
            );
            if (handled) {
                return;
            }
            // If not handled, fall through to legacy handlers
        }

        switch (data.type) {

            case 'PING':
                sendResponse(rinfo.address, { type: 'PONG' });
                break;
            case 'PONG':
                console.log('DEBUG handlePacket - PONG received:', {
                    fromAddress: rinfo.address,
                    revelnestId,
                    timestamp: Date.now()
                });
                // Silently acknowledge PONG responses (they indicate connectivity)
                // Could update lastSeen here, but already done earlier
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
            case 'FILE_PROPOSAL':
            case 'FILE_START':
            case 'FILE_ACCEPT':
            case 'FILE_CHUNK':
            case 'FILE_CHUNK_ACK':
            case 'FILE_ACK':
            case 'FILE_DONE_ACK':
            case 'FILE_END':
            case 'FILE_CANCEL':
                fileTransferManager.handleMessage(revelnestId, rinfo.address, data);
                break;
            default:
                warn('Unknown packet', { revelnestId, type: data.type, ip: rinfo.address }, 'network');
        }
    } catch (e) {
        error('UDP Packet Error', e, 'network');
    }
}

async function handleDhtUpdate(revelnestId: string, contact: any, data: any) {
    const block = data.locationBlock;
    if (!block || typeof block.dhtSeq !== 'number' || !block.address || !block.signature) return;

    const isValid = verifyLocationBlock(revelnestId, block, contact.publicKey);
    if (!isValid) {
        security('Invalid DHT_UPDATE signature', { revelnestId }, 'dht');
        return;
    }

    if (block.dhtSeq > (contact.dhtSeq || 0)) {
        network('Updating location', undefined, { revelnestId, address: block.address, dhtSeq: block.dhtSeq }, 'dht');
        updateContactDhtLocation(revelnestId, block.address, block.dhtSeq, block.signature, block.expiresAt);
    }
}

async function handleDhtExchange(revelnestId: string, data: any) {
    if (!Array.isArray(data.peers)) return;
    network('Receiving peer locations', undefined, { revelnestId, count: data.peers.length }, 'dht');

    for (const peer of data.peers) {
        if (!peer.revelnestId || !peer.publicKey || !peer.locationBlock) continue;
        if (peer.revelnestId === getMyRevelNestId()) continue;

        const existing = await getContactByRevelnestId(peer.revelnestId);
        if (!existing) continue;

        const block = peer.locationBlock;
        if (typeof block.dhtSeq !== 'number' || !block.address || !block.signature) continue;

        const isValid = verifyLocationBlock(peer.revelnestId, block, existing.publicKey);
        if (!isValid) {
            security('Invalid PEEREX signature', { peerId: peer.revelnestId }, 'dht');
            continue;
        }

        if (block.dhtSeq > (existing.dhtSeq || 0)) {
            updateContactDhtLocation(peer.revelnestId, block.address, block.dhtSeq, block.signature, block.expiresAt);
        }
    }
}

async function handleDhtQuery(revelnestId: string, data: any, fromAddress: string, sendResponse: (ip: string, data: any) => void) {
    network('DHT query', undefined, { requester: revelnestId, target: data.targetId }, 'dht');
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
            network('DHT search found', undefined, { target: data.targetId, address: block.address }, 'dht');
            updateContactDhtLocation(data.targetId, block.address, block.dhtSeq, block.signature, block.expiresAt);
        }
    } else if (data.neighbors) {
        network('DHT search referrals', undefined, { requester: revelnestId, target: data.targetId, count: data.neighbors.length }, 'dht');
        for (const peer of data.neighbors) {
            if (peer.revelnestId === getMyRevelNestId()) continue;
            const existing = await getContactByRevelnestId(peer.revelnestId);
            if (!existing) {
                if (peer.locationBlock?.address) {
                    sendResponse(peer.locationBlock.address, { type: 'DHT_QUERY', targetId: data.targetId });
                }
            } else if (peer.locationBlock?.dhtSeq > (existing.dhtSeq || 0)) {
                updateContactDhtLocation(peer.revelnestId, peer.locationBlock.address, peer.locationBlock.dhtSeq, peer.locationBlock.signature, peer.locationBlock.expiresAt);
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
            error('Decryption failed', err, 'security');
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

    // Contact cache removed for privacy reasons
    // Previously: processed second-degree contacts for extreme resilience
    // Now: relying on DHT persistence and renewal tokens

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

// End of file
