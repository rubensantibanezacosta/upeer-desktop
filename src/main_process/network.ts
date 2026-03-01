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
    updateContactPublicKey,
    updateContactEphemeralPublicKey,
    updateContactDhtLocation,
    getContacts
} from './database.js';
import crypto from 'node:crypto';
import { getMyPublicKeyHex, getMyRevelNestId, sign, verify, encrypt, decrypt, getMyEphemeralPublicKeyHex, getMyDhtSeq, incrementMyDhtSeq } from './identity.js';

/**
 * Ensures JSON keys are always in the same order for consistent signatures.
 */
function canonicalStringify(obj: any): string {
    const allKeys = Object.keys(obj).sort();
    return JSON.stringify(obj, allKeys);
}

export function generateSignedLocationBlock(address: string, dhtSeq: number) {
    const data = { revelnestId: getMyRevelNestId(), address, dhtSeq };
    const sig = sign(Buffer.from(canonicalStringify(data))).toString('hex');
    return { address, dhtSeq, signature: sig };
}

export function verifyLocationBlock(revelnestId: string, block: { address: string, dhtSeq: number, signature: string }, publicKeyHex: string): boolean {
    const data = { revelnestId, address: block.address, dhtSeq: block.dhtSeq };
    return verify(
        Buffer.from(canonicalStringify(data)),
        Buffer.from(block.signature, 'hex'),
        Buffer.from(publicKeyHex, 'hex')
    );
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

                addOrUpdateContact(data.revelnestId, rinfo.address, data.alias || `Peer ${data.revelnestId.slice(0, 4)}`, data.publicKey, 'incoming', data.ephemeralPublicKey);

                mainWindow?.webContents.send('contact-request-received', {
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

            // 4. CHAT & DHT LOGIC
            if (data.type === 'DHT_UPDATE') {
                const block = data.locationBlock;
                if (!block || typeof block.dhtSeq !== 'number' || !block.address || !block.signature) return;

                // Zero-Trust Validation: verify the signature using contact's public key
                const isValid = verifyLocationBlock(revelnestId, block, contact.publicKey);
                if (!isValid) {
                    console.error(`[DHT Security] Invalid DHT_UPDATE signature from ${revelnestId}`);
                    return;
                }

                if (block.dhtSeq > (contact.dhtSeq || 0)) {
                    console.log(`[DHT] Actualizando ubicación de ${revelnestId} a ${block.address} (Seq: ${block.dhtSeq})`);
                    updateContactDhtLocation(revelnestId, block.address, block.dhtSeq, block.signature);
                } else {
                    console.log(`[DHT] Ignorando actualización obsoleta o inválida de ${revelnestId} (Seq: ${block.dhtSeq} <= ${contact.dhtSeq})`);
                }
                return;
            } else if (data.type === 'DHT_EXCHANGE') {
                if (!Array.isArray(data.peers)) return;
                console.log(`[DHT PEEREX] Recibiendo ${data.peers.length} ubicaciones de ${revelnestId}`);

                for (const peer of data.peers) {
                    if (!peer.revelnestId || !peer.publicKey || !peer.locationBlock) continue;
                    if (peer.revelnestId === getMyRevelNestId()) continue; // Ignore myself

                    const existing = await getContactByRevelnestId(peer.revelnestId);
                    if (!existing) continue; // Roaming only updates existing contacts

                    const block = peer.locationBlock;
                    if (typeof block.dhtSeq !== 'number' || !block.address || !block.signature) continue;

                    // Zero-Trust Validation from the final owner
                    const isValid = verifyLocationBlock(peer.revelnestId, block, existing.publicKey);
                    if (!isValid) {
                        console.error(`[DHT Security] Invalid PEEREX signature for ${peer.revelnestId}`);
                        continue;
                    }

                    if (block.dhtSeq > (existing.dhtSeq || 0)) {
                        console.log(`[DHT] Actualizada IP de ${peer.revelnestId} a ${block.address} via PEEREX (Seq: ${block.dhtSeq})`);
                        updateContactDhtLocation(
                            peer.revelnestId,
                            block.address,
                            block.dhtSeq,
                            block.signature
                        );
                    }
                }
                return;
            } else if (data.type === 'DHT_QUERY') {
                console.log(`[DHT Query] Buscando ${data.targetId} a petición de ${revelnestId}`);
                const target = await getContactByRevelnestId(data.targetId);

                let responseData: any = { type: 'DHT_RESPONSE', targetId: data.targetId };

                if (target && target.status === 'connected' && target.dhtSignature) {
                    // Tenemos la ubicación firmada del contacto buscado
                    responseData.locationBlock = {
                        address: target.address,
                        dhtSeq: target.dhtSeq,
                        signature: target.dhtSignature
                    };
                    responseData.publicKey = target.publicKey;
                } else {
                    // No lo tenemos, pero enviamos nuestros N contactos más "cercanos" matemáticamente a ese ID
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
                sendSecureUDPMessage(rinfo.address, responseData);
                return;

            } else if (data.type === 'DHT_RESPONSE') {
                if (data.locationBlock) {
                    const block = data.locationBlock;
                    const existing = await getContactByRevelnestId(data.targetId);
                    if (!existing) return;

                    // Zero-Trust Validation
                    const isValid = verifyLocationBlock(data.targetId, block, existing.publicKey || data.publicKey);
                    if (isValid && block.dhtSeq > (existing.dhtSeq || 0)) {
                        console.log(`[DHT Search] ¡ENCONTRADO! Nueva IP para ${data.targetId}: ${block.address}`);
                        updateContactDhtLocation(data.targetId, block.address, block.dhtSeq, block.signature);

                        // Opcional: Re-enviar mensajes pendientes si la IP cambió
                        // Para simplificar, el usuario re-intentará o el próximo latido lo hará.
                    }
                } else if (data.neighbors) {
                    console.log(`[DHT Search] Recibidos ${data.neighbors.length} referidos de ${revelnestId} para buscar a ${data.targetId}`);
                    // Iterar: preguntamos a los referidos
                    for (const peer of data.neighbors) {
                        if (peer.revelnestId === getMyRevelNestId()) continue;
                        // Opción: consultar recursivamente (limitado por TTL o lógica de búsqueda)
                        // Por ahora los añadimos como potenciales si no existen
                        const existing = await getContactByRevelnestId(peer.revelnestId);
                        if (!existing) {
                            // Si no conocemos al referido, lo guardamos para el roaming (opcional)
                            // Pero para la búsqueda actual, simplemente le enviamos la query si tiene IP
                            if (peer.locationBlock?.address) {
                                sendSecureUDPMessage(peer.locationBlock.address, { type: 'DHT_QUERY', targetId: data.targetId });
                            }
                        } else if (peer.locationBlock?.dhtSeq > (existing.dhtSeq || 0)) {
                            updateContactDhtLocation(peer.revelnestId, peer.locationBlock.address, peer.locationBlock.dhtSeq, peer.locationBlock.signature);
                            sendSecureUDPMessage(peer.locationBlock.address, { type: 'DHT_QUERY', targetId: data.targetId });
                        }
                    }
                }
                return;
            } else if (data.type === 'PING') {
                sendSecureUDPMessage(rinfo.address, { type: 'PONG' });
            } else if (data.type === 'CHAT') {
                const msgId = data.id || crypto.randomUUID();

                if (data.ephemeralPublicKey) {
                    updateContactEphemeralPublicKey(revelnestId, data.ephemeralPublicKey);
                    // Actualizamos memoria temporal si es necesario, pero SQLite lo maneja
                }

                // 🔐 E2EE Decryption
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
                            displayContent = "🔒 [Error de descifrado: El mensaje podría estar corrupto o la llave es incorrecta]";
                        }
                    } catch (err) {
                        displayContent = "🔒 [Error crítico de seguridad al descifrar PFS]";
                        console.error('Decryption failed:', err);
                    }
                }

                saveMessage(msgId, revelnestId, false, displayContent, data.replyTo, signature);
                mainWindow?.webContents.send('receive-p2p-message', {
                    id: msgId,
                    revelnestId: revelnestId,
                    isMine: false,
                    message: displayContent,
                    replyTo: data.replyTo,
                    status: 'received',
                    encrypted: !!data.nonce
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

export async function sendUDPMessage(revelnestId: string, message: string | { [key: string]: any }, replyTo?: string): Promise<string | undefined> {
    const msgId = crypto.randomUUID();
    const content = typeof message === 'string' ? message : (message as any).content;

    const contact = await getContactByRevelnestId(revelnestId);
    if (!contact || contact.status !== 'connected' || !contact.publicKey) return undefined;

    // PFS E2EE Encryption
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

    // Auto-Discovery Fallback: si en 5 segundos no hay ACK, iniciamos búsqueda activa en la DHT
    setTimeout(async () => {
        const { getMessageStatus } = await import('./database.js');
        const status = await getMessageStatus(msgId);
        if (status === 'sent') {
            console.warn(`[Network] Mensaje ${msgId} no entregado a ${revelnestId}. Iniciando búsqueda reactiva...`);
            startDhtSearch(revelnestId);
        }
    }, 5000);

    return msgId;
}

export function checkHeartbeat(contacts: any[]) {
    for (const contact of contacts) {
        if (contact.status === 'connected') {
            sendSecureUDPMessage(contact.address, { type: 'PING' });

            // Periodically ping with our routing tables
            sendDhtExchange(contact.revelnestId);
        }
    }
}

let lastKnownIp: string | null = null;

export function broadcastDhtUpdate() {
    const currentIp = getNetworkAddress();
    if (!currentIp) return;

    // Check if IP changed or we just started up up
    if (currentIp !== lastKnownIp) {
        lastKnownIp = currentIp;
        const newSeq = incrementMyDhtSeq();

        console.log(`[DHT] IP propia detectada/cambiada a ${currentIp}. Propagando DHT_UPDATE (Seq: ${newSeq})...`);
        const locBlock = generateSignedLocationBlock(currentIp, newSeq);
        const contacts = getContacts();
        for (const contact of contacts) {
            if (contact.status === 'connected') {
                sendSecureUDPMessage(contact.address, {
                    type: 'DHT_UPDATE',
                    locationBlock: locBlock
                });
            }
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

export async function sendDhtExchange(targetRevelnestId: string) {
    const targetContact = await getContactByRevelnestId(targetRevelnestId);
    if (!targetContact || targetContact.status !== 'connected') return;

    const allContacts = getContacts() as any[];

    // Kademlia DHT estructurada: XOR distance
    const distanceXOR = (idA: string, idB: string) => {
        try {
            return BigInt('0x' + idA) ^ BigInt('0x' + idB);
        } catch {
            return BigInt(0);
        }
    };

    const payload = allContacts
        .filter(c => c.status === 'connected' && c.dhtSignature && c.revelnestId !== targetRevelnestId)
        .map(c => ({
            revelnestId: c.revelnestId,
            publicKey: c.publicKey,
            locationBlock: {
                address: c.address,
                dhtSeq: c.dhtSeq,
                signature: c.dhtSignature
            },
            dist: distanceXOR(c.revelnestId, targetRevelnestId)
        }))
        // Kademlia: Enviamos los nodos más "cercanos" matemáticamente a nuestro objetivo (XOR distance)
        .sort((a, b) => (a.dist < b.dist ? -1 : a.dist > b.dist ? 1 : 0))
        .map(({ dist, ...data }) => data);

    // Limit size to avoid UDP fragmentation (only top 5 closest nearest neighbors in ID geometry)
    const limitedPayload = payload.slice(0, 5);

    if (limitedPayload.length > 0) {
        sendSecureUDPMessage(targetContact.address, {
            type: 'DHT_EXCHANGE',
            peers: limitedPayload
        });
    }
}

/**
 * Inicia una búsqueda activa en la red para un RevelNestId específico.
 * Se utiliza cuando la comunicación directa falla (el contacto cambió de IP y no nos avisó).
 */
export async function startDhtSearch(revelnestId: string) {
    console.log(`[DHT Search] Iniciando búsqueda activa para: ${revelnestId}`);
    const allContacts = getContacts() as any[];

    // Matemática XOR para encontrar a quién preguntar (nodos más cercanos al objetivo)
    const distanceXOR = (idA: string, idB: string) => {
        try { return BigInt('0x' + idA) ^ BigInt('0x' + idB); }
        catch { return BigInt(0); }
    };

    const queryTargets = allContacts
        .filter(c => c.status === 'connected' && c.revelnestId !== revelnestId)
        .map(c => ({
            revelnestId: c.revelnestId,
            address: c.address,
            dist: distanceXOR(c.revelnestId, revelnestId)
        }))
        .sort((a, b) => (a.dist < b.dist ? -1 : a.dist > b.dist ? 1 : 0))
        .slice(0, 3); // Preguntamos a los 3 más cercanos

    for (const target of queryTargets) {
        sendSecureUDPMessage(target.address, {
            type: 'DHT_QUERY',
            targetId: revelnestId
        });
    }
}

export function closeUDPServer() {
    if (udpSocket) udpSocket.close();
}
