import { BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import {
    saveMessage,
    updateLastSeen,
    updateMessageStatus,
    getContactByUpeerId,
    addOrUpdateContact,
    getContactByAddress,
    deleteContact,
    isContactBlocked,
    updateContactLocation,
    updateContactPublicKey,
    updateContactEphemeralPublicKey,
    updateContactDhtLocation,
    getContacts,
    saveReaction,
    deleteReaction,
    updateMessageContent,
    deleteMessageLocally,
    saveGroup,
    getGroupById,
    updateGroupInfo,
    updateGroupMembers,
    saveFileMessage,
    // updateContactFromCache
} from '../storage/db.js';

import {
    getMyUPeerId,
    decrypt,
    verify,
    getUPeerIdFromPublicKey
} from '../security/identity.js';
import { AdaptivePow } from '../security/pow.js';
import { canonicalStringify, verifyLocationBlock } from './utils.js';
import { handleDhtPacket } from './dht/handlers.js';
import { fileTransferManager } from './file-transfer/index.js';
import { IdentityRateLimiter } from '../security/identity-rate-limiter.js';
import { issueVouch, VouchType, saveIncomingVouch, getGossipIds, getVouchesForDelivery, computeScore } from '../security/reputation/vouches.js';
import { validateMessage } from '../security/validation.js';
import { network, security, warn, error, debug } from '../security/secure-logger.js';
import { unsealPacket } from './sealed.js';
import { decryptSealed } from '../security/identity.js';

// Global rate limiter instance
const rateLimiter = new IdentityRateLimiter();

/** BUG AP fix: exponer cleanup para que server.ts lo llame cada hora. */
export function cleanupRateLimiter(): void {
    rateLimiter.cleanup();
}

export async function handlePacket(
    msg: Buffer,
    rinfo: { address: string; port: number },
    win: BrowserWindow | null,
    sendResponse: (ip: string, data: any) => void,
    startDhtSearch: (upeerId: string) => void
) {
    try {
        const fullPacket = JSON.parse(msg.toString());

        // ── Sealed Sender: desempaquetar antes de cualquier otro procesamiento ──
        // El paquete SEALED no tiene senderUpeerId en claro.
        // Solo el destinatario (nosotros) puede descifrar el inner packet.
        if (fullPacket.type === 'SEALED') {
            // BUG DJ fix: la rama SEALED ejecutaba unsealPacket() (operación DH X25519)
            // antes del rate limiter, permitiendo a cualquier IP forzar operaciones
            // criptográficas ilimitadas por segundo. Comprobar límite por IP ANTES de decrypt.
            if (!rateLimiter.checkIp(rinfo.address, 'SEALED')) {
                return;
            }
            const inner = unsealPacket(fullPacket, (ephPub, nonce, ct) => decryptSealed(ephPub, nonce, ct));
            if (!inner) {
                security('SEALED: failed to decrypt', { ip: rinfo.address }, 'network');
                return;
            }
            // Re-procesar el inner packet como si hubiera llegado directamente
            return handlePacket(Buffer.from(JSON.stringify(inner)), rinfo, win, sendResponse, startDhtSearch);
        }

        const { signature, senderUpeerId, senderYggAddress, ...data } = fullPacket;

        // BUG CM fix: guardar la IP de transporte TCP real ANTES del override.
        // El rate-limiter IP debe usar la dirección real (no la declarada por el peer).
        // senderYggAddress no está verificado en este punto; un contacto conectado
        // podría falsificarla para evadir su propio límite o degradar el de otra IP.
        const tcpSourceAddress = rinfo.address;

        // Cuando el tráfico entra reenviado por yggstack (-remote-tcp), rinfo.address
        // es 127.0.0.1. El emisor firma su dirección Yggdrasil real dentro del paquete
        // (senderYggAddress), así que la usamos como fuente autoritativa para el routing,
        // pero solo después de que la firma haya sido verificada (ver sección 3 más abajo).
        if (senderYggAddress && /^[23][0-9a-f]{2}:/i.test(senderYggAddress)) {
            rinfo = { ...rinfo, address: senderYggAddress };
        }

        // Special logging for FILE_CHUNK to debug missing chunk 0
        if (data.type === 'FILE_CHUNK') {
            debug('FILE_CHUNK received', {
                fileId: data.fileId,
                chunkIndex: data.chunkIndex,
                totalChunks: data.totalChunks,
                dataSize: data.data?.length
            }, 'file-transfer');
        }

        // Rate limiting check — usar tcpSourceAddress (no la senderYggAddress no verificada)
        if (!data.type || typeof data.type !== 'string') {
            security('Packet missing type', { ip: tcpSourceAddress }, 'network');
            return;
        }

        if (!rateLimiter.checkIp(tcpSourceAddress, data.type)) {
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
            if (!signature || !senderUpeerId || !data.publicKey) {
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
            // senderUpeerId y senderYggAddress se incluyen en la firma (desde server.ts)
            // para evitar address spoofing. Los añadimos aquí para que la verificación sea coherente.
            const payloadForVerification = { ...dataForVerification, senderUpeerId, senderYggAddress };
            const isValidSignature = verify(
                Buffer.from(canonicalStringify(payloadForVerification)),
                Buffer.from(signature, 'hex'),
                Buffer.from(data.publicKey, 'hex')
            );

            if (!isValidSignature) {
                // Backward-compat fallback: peers with old firmware sign without senderYggAddress
                const legacyPayload = { ...dataForVerification, senderUpeerId };
                const legacyValid = verify(
                    Buffer.from(canonicalStringify(legacyPayload)),
                    Buffer.from(signature, 'hex'),
                    Buffer.from(data.publicKey, 'hex')
                );
                if (!legacyValid) {
                    security('Invalid HANDSHAKE_REQ signature', { ip: rinfo.address }, 'network');
                    return;
                }
            }

            // Verify senderUpeerId matches derived ID from public key
            const derivedId = getUPeerIdFromPublicKey(Buffer.from(data.publicKey, 'hex'));
            if (derivedId !== senderUpeerId) {
                security('HANDSHAKE_REQ ID mismatch', { ip: rinfo.address, expected: derivedId, received: senderUpeerId }, 'network');
                return;
            }

            network('Handshake request verified', rinfo.address, { upeerId: senderUpeerId }, 'handshake');

            // Silently drop packets from blocked contacts
            if (isContactBlocked(senderUpeerId)) {
                security('Blocked contact attempted handshake', { upeerId: senderUpeerId, ip: rinfo.address }, 'network');
                return;
            }

            // Apply identity-based rate limiting
            if (!rateLimiter.checkIdentity(rinfo.address, senderUpeerId, data.type)) {
                // Silently drop packet when rate limited (already logged by rate limiter)
                return;
            }

            // Check if contact already exists
            const existingContact = await getContactByUpeerId(senderUpeerId);
            const isNewContact = !existingContact;

            // Require PoW for new contacts (Sybil resistance)
            if (isNewContact) {
                if (!data.powProof) {
                    security('New contact requires PoW proof', { upeerId: senderUpeerId, ip: rinfo.address }, 'pow');
                    return;
                }
                if (!AdaptivePow.verifyLightProof(data.powProof, senderUpeerId)) {
                    security('Invalid PoW proof from new contact', { upeerId: senderUpeerId, ip: rinfo.address }, 'pow');
                    return;
                }
                security('PoW verified for new contact', { upeerId: senderUpeerId, ip: rinfo.address }, 'pow');
            }

            issueVouch(senderUpeerId, VouchType.HANDSHAKE).catch(() => { });

            // Si ya tenemos vouches del nodo y su score es bajo, alertar
            const { getContacts: _gc } = await import('../storage/db.js').catch(() => ({ getContacts: () => [] })) as any;
            const _contacts = _gc() as any[];
            const _directIds = new Set<string>(_contacts.filter((c: any) => c.status === 'connected' && c.upeerId).map((c: any) => c.upeerId as string));
            const vouchScore = computeScore(senderUpeerId, _directIds);
            if (vouchScore < 40) {
                security('Low vouch score contact detected', { upeerId: senderUpeerId, score: vouchScore, ip: rinfo.address }, 'reputation');
                win?.webContents.send('contact-untrustworthy', {
                    upeerId: senderUpeerId,
                    address: rinfo.address,
                    alias: data.alias,
                    reason: 'low_reputation'
                });
            }

            // BUG BD fix: rechazar handshake de contactos bloqueados antes de llamar a
            // addOrUpdateContact. Sin esta guarda, un contacto bloqueado que enviara un
            // HANDSHAKE_REQ obtenía status 'incoming' en el upsert, saltándose el bloqueo.
            if (existingContact?.status === 'blocked') {
                security('Rejected handshake from blocked contact', { upeerId: senderUpeerId, ip: rinfo.address }, 'security');
                return;
            }

            const isAlreadyConnected = existingContact?.status === 'connected';
            const newStatus = isAlreadyConnected ? 'connected' : 'incoming';
            // Bug FA fix: limitar alias a 100 chars para evitar DoS por nombres gigantes
            const rawAlias = typeof data.alias === 'string' ? data.alias.slice(0, 100) : null;
            const alias = rawAlias || existingContact?.name || `Peer ${senderUpeerId.slice(0, 4)}`;

            // ── TOFU check: detectar si la clave estática cambió ─────────────
            if (isAlreadyConnected && existingContact?.publicKey && existingContact.publicKey !== data.publicKey) {
                import('../storage/contacts/keys.js').then(({ computeKeyFingerprint }) => {
                    win?.webContents.send('key-change-alert', {
                        upeerId: senderUpeerId,
                        oldFingerprint: computeKeyFingerprint(existingContact.publicKey),
                        newFingerprint: computeKeyFingerprint(data.publicKey),
                        alias: alias,
                    });
                }).catch(() => { });
                security('TOFU: static public key changed on re-handshake!', { upeerId: senderUpeerId, ip: rinfo.address }, 'security');
            }

            // Bug FI fix: ephemeralPublicKey debe ser hex de 64 chars (Curve25519 = 32 bytes).
            // Sin validación, un peer puede enviar strings arbitrarios que se persisten en la DB.
            const safeEphKey = typeof data.ephemeralPublicKey === 'string' && /^[0-9a-f]{64}$/i.test(data.ephemeralPublicKey)
                ? data.ephemeralPublicKey : undefined;
            addOrUpdateContact(senderUpeerId, rinfo.address, alias, data.publicKey, newStatus, safeEphKey);

            // Guardar Signed PreKey del contacto para futuros X3DH / Double Ratchet
            if (data.signedPreKey && typeof data.signedPreKey === 'object') {
                const { spkPub, spkSig, spkId } = data.signedPreKey;
                if (typeof spkPub === 'string' && typeof spkSig === 'string' && typeof spkId === 'number') {
                    try {
                        const spkValid = verify(
                            Buffer.from(spkPub, 'hex'),
                            Buffer.from(spkSig, 'hex'),
                            Buffer.from(data.publicKey, 'hex')
                        );
                        if (spkValid) {
                            import('../storage/contacts/keys.js').then(({ updateContactSignedPreKey }) => {
                                updateContactSignedPreKey(senderUpeerId, spkPub, spkSig, spkId);
                            }).catch(() => { });
                        } else {
                            security('HANDSHAKE_REQ: firma SPK inválida', { upeerId: senderUpeerId }, 'security');
                        }
                    } catch { /* ignorar */ }
                }
            }

            // Save avatar if provided by the peer (Bug FA fix: ≤ 2 MB)
            if (data.avatar && typeof data.avatar === 'string' && data.avatar.startsWith('data:image/') && data.avatar.length <= 2_000_000) {
                import('../storage/db.js').then(({ updateContactAvatar }) => {
                    updateContactAvatar?.(senderUpeerId, data.avatar);
                }).catch(() => { });
            }

            if (isAlreadyConnected) {
                // If they re-request connection but are already accepted, silently accept and refresh presence
                win?.webContents.send('contact-presence', { upeerId: senderUpeerId, lastSeen: new Date().toISOString() });

                import('./server.js').then(({ acceptContactRequest }) => {
                    acceptContactRequest(senderUpeerId, data.publicKey);
                }).catch(err => error('Failed to auto-accept known contact', err, 'network'));
                return;
            }

            win?.webContents.send('contact-request-received', {
                upeerId: senderUpeerId,
                address: rinfo.address,
                alias: data.alias,
                avatar: data.avatar || undefined,
                publicKey: data.publicKey,
                ephemeralPublicKey: data.ephemeralPublicKey,
                vouchScore,
            });
            return;
        }

        if (data.type === 'HANDSHAKE_ACCEPT') {
            // Verify signature using provided public key
            if (!signature || !senderUpeerId || !data.publicKey) {
                security('HANDSHAKE_ACCEPT missing required fields', { ip: rinfo.address }, 'network');
                return;
            }

            // Verificar con senderUpeerId + senderYggAddress (formato post-Phase4)
            const acceptPayload = { ...data, senderUpeerId, senderYggAddress };
            let isValidAcceptSignature = verify(
                Buffer.from(canonicalStringify(acceptPayload)),
                Buffer.from(signature, 'hex'),
                Buffer.from(data.publicKey, 'hex')
            );
            if (!isValidAcceptSignature) {
                // Fallback: sin senderYggAddress (peers con firmware anterior)
                const legacyAcceptPayload = { ...data, senderUpeerId };
                isValidAcceptSignature = verify(
                    Buffer.from(canonicalStringify(legacyAcceptPayload)),
                    Buffer.from(signature, 'hex'),
                    Buffer.from(data.publicKey, 'hex')
                );
            }
            if (!isValidAcceptSignature) {
                // Super-legacy: solo los datos del paquete (firmware muy antiguo)
                isValidAcceptSignature = verify(
                    Buffer.from(canonicalStringify(data)),
                    Buffer.from(signature, 'hex'),
                    Buffer.from(data.publicKey, 'hex')
                );
            }

            if (!isValidAcceptSignature) {
                security('Invalid HANDSHAKE_ACCEPT signature', { ip: rinfo.address }, 'network');
                return;
            }

            // Verify senderUpeerId matches derived ID from public key
            const derivedId = getUPeerIdFromPublicKey(Buffer.from(data.publicKey, 'hex'));
            if (derivedId !== senderUpeerId) {
                security('HANDSHAKE_ACCEPT ID mismatch', { ip: rinfo.address, expected: derivedId, received: senderUpeerId }, 'network');
                return;
            }

            network('Handshake accepted verified', rinfo.address, { upeerId: senderUpeerId }, 'handshake');

            // Apply identity-based rate limiting
            if (!rateLimiter.checkIdentity(rinfo.address, senderUpeerId, data.type)) {
                // Silently drop packet when rate limited (already logged by rate limiter)
                return;
            }

            // Limpieza de fantasmas: Borramos cualquier rastro previo de esta IP si era un temporal
            const ghost = await getContactByAddress(rinfo.address);
            if (ghost && ghost.upeerId.startsWith('pending-')) {
                deleteContact(ghost.upeerId);
            }

            const existing = await getContactByUpeerId(senderUpeerId);
            if (existing && existing.status === 'pending') {
                const keyResult = updateContactPublicKey(senderUpeerId, data.publicKey);
                if (keyResult.changed && keyResult.oldKey) {
                    // ⚠️ TOFU alert: la clave criptográfica de este contacto cambió
                    import('../storage/contacts/keys.js').then(({ computeKeyFingerprint }) => {
                        win?.webContents.send('key-change-alert', {
                            upeerId: senderUpeerId,
                            oldFingerprint: computeKeyFingerprint(keyResult.oldKey!),
                            newFingerprint: computeKeyFingerprint(keyResult.newKey),
                            alias: data.alias || existing.name,
                        });
                    }).catch(() => { });
                }
                // Bug FI fix: misma validación hex-64 de ephemeralPublicKey.
                if (data.ephemeralPublicKey && typeof data.ephemeralPublicKey === 'string' && /^[0-9a-f]{64}$/i.test(data.ephemeralPublicKey)) {
                    updateContactEphemeralPublicKey(senderUpeerId, data.ephemeralPublicKey);
                }
                // Guardar Signed PreKey del contacto (HANDSHAKE_ACCEPT)
                if (data.signedPreKey && typeof data.signedPreKey === 'object') {
                    const { spkPub, spkSig, spkId } = data.signedPreKey;
                    if (typeof spkPub === 'string' && typeof spkSig === 'string' && typeof spkId === 'number') {
                        try {
                            const spkValid = verify(
                                Buffer.from(spkPub, 'hex'),
                                Buffer.from(spkSig, 'hex'),
                                Buffer.from(data.publicKey, 'hex')
                            );
                            if (spkValid) {
                                import('../storage/contacts/keys.js').then(({ updateContactSignedPreKey }) => {
                                    updateContactSignedPreKey(senderUpeerId, spkPub, spkSig, spkId);
                                }).catch(() => { });
                            }
                        } catch { /* ignorar */ }
                    }
                }
                // Update contact name with their real alias if they provided one (Bug FA fix: ≤ 100 chars)
                if (data.alias && typeof data.alias === 'string') {
                    import('../storage/db.js').then(({ updateContactName }) => {
                        updateContactName?.(senderUpeerId, (data.alias as string).slice(0, 100));
                    }).catch(() => { });
                }
                // Update contact avatar if provided (Bug FA fix: ≤ 2 MB)
                if (data.avatar && typeof data.avatar === 'string' && data.avatar.startsWith('data:image/') && data.avatar.length <= 2_000_000) {
                    import('../storage/db.js').then(({ updateContactAvatar }) => {
                        updateContactAvatar?.(senderUpeerId, data.avatar);
                    }).catch(() => { });
                }

                // Fix 3 — Flush pending outbox: si habíamos intentado escribirle antes de
                // tener su clave pública, ahora la tenemos → cifrar + vaultear esos mensajes.
                if (data.publicKey) {
                    import('../storage/pending-outbox.js').then(({ flushPendingOutbox }) => {
                        flushPendingOutbox(senderUpeerId, data.publicKey).catch(() => { });
                    }).catch(() => { });
                }

                win?.webContents.send('contact-handshake-finished', { upeerId: senderUpeerId });
            }
            return;
        }

        // 2. SECURITY CHECK
        const upeerId = senderUpeerId;
        if (!upeerId) return;

        const contact = await getContactByUpeerId(upeerId);
        if (!contact || contact.status !== 'connected' || !contact.publicKey) {
            security('Origin not connected or missing key', { upeerId, ip: rinfo.address }, 'network');
            return;
        }

        // Debug logging for FILE_CHUNK
        if (data.type === 'FILE_CHUNK') {
            debug('FILE_CHUNK pre-verify', { fileId: data.fileId, chunkIndex: data.chunkIndex }, 'file-transfer');
        }

        // Exclude fields that are not part of the signature
        const fieldsToExclude = ['contactCache', 'renewalToken'];
        const dataForVerification = { ...data };
        fieldsToExclude.forEach(field => {
            if (field in dataForVerification) {
                delete dataForVerification[field];
            }
        });
        // senderUpeerId y senderYggAddress se incluyen en la firma para evitar address spoofing.
        const payloadForVerification = { ...dataForVerification, senderUpeerId, senderYggAddress };
        let verified = verify(
            Buffer.from(canonicalStringify(payloadForVerification)),
            Buffer.from(signature, 'hex'),
            Buffer.from(contact.publicKey, 'hex')
        );
        if (!verified) {
            // Backward-compat: peers con firmware antiguo firman sin senderYggAddress
            const legacyPayload = { ...dataForVerification, senderUpeerId };
            verified = verify(
                Buffer.from(canonicalStringify(legacyPayload)),
                Buffer.from(signature, 'hex'),
                Buffer.from(contact.publicKey, 'hex')
            );
        }

        if (!verified) {
            security('Invalid signature', { upeerId, ip: rinfo.address }, 'network');
            return;
        } else if (data.type === 'FILE_CHUNK') {
            debug('FILE_CHUNK signature verified', { fileId: data.fileId, chunkIndex: data.chunkIndex }, 'file-transfer');
        }

        // Apply identity-based rate limiting
        if (!rateLimiter.checkIdentity(rinfo.address, upeerId, data.type)) {
            // Silently drop packet when rate limited (already logged by rate limiter)
            return;
        }

        // 3. SOVEREIGN ROAMING
        // Solo actualizamos la dirección si viene una IPv6 Yggdrasil real (200::/7).
        // Esto evita que el forward de yggstack (127.0.0.1) sobreescriba la dirección
        // almacenada del contacto cuando no viene senderYggAddress en el paquete.
        const YGG_ADDR_RE = /^[23][0-9a-f]{2}:/i;
        if (contact.address !== rinfo.address && YGG_ADDR_RE.test(rinfo.address)) {
            updateContactLocation(upeerId, rinfo.address);
        }

        const nowIso = new Date().toISOString();
        updateLastSeen(upeerId);
        win?.webContents.send('contact-presence', {
            upeerId,
            lastSeen: nowIso,
            alias: data.alias ?? undefined,
            avatar: data.avatar ?? undefined,
        });

        // 4. CHAT & DHT LOGIC
        // First, try to handle DHT messages with the new Kademlia handler
        if (data.type.startsWith('DHT_')) {
            const handled = await handleDhtPacket(
                data.type,
                data,
                upeerId,
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
                // Update contact alias/avatar if the peer included them
                if (data.alias && typeof data.alias === 'string') {
                    import('../storage/db.js').then(({ updateContactName }) => {
                        updateContactName?.(upeerId, (data.alias as string).slice(0, 100));
                    }).catch(() => { });
                }
                if (data.avatar && typeof data.avatar === 'string' && data.avatar.startsWith('data:image/') && data.avatar.length <= 2_000_000) {
                    import('../storage/db.js').then(({ updateContactAvatar }) => {
                        updateContactAvatar?.(upeerId, data.avatar);
                    }).catch(() => { });
                }
                break;
            case 'VAULT_STORE':
                await (await import('./vault/protocol/handlers.js')).handleVaultStore(upeerId, data, rinfo.address, sendResponse);
                break;
            case 'VAULT_QUERY':
                await (await import('./vault/protocol/handlers.js')).handleVaultQuery(upeerId, data, rinfo.address, sendResponse);
                break;
            case 'VAULT_ACK':
                await (await import('./vault/protocol/handlers.js')).handleVaultAck(upeerId, data);
                break;
            case 'VAULT_DELIVERY':
                await handleVaultDelivery(upeerId, data, win, sendResponse, rinfo.address);
                break;
            case 'VAULT_RENEW':
                await (await import('./vault/protocol/handlers.js')).handleVaultRenew(upeerId, data);
                break;

            case 'CHAT':

                handleChatMessage(upeerId, contact, data, win, signature, rinfo.address, sendResponse);
                break;
            case 'ACK':
                handleAck(upeerId, data, win);
                break;
            case 'READ':
                handleReadReceipt(upeerId, data, win);
                break;
            case 'TYPING':
                win?.webContents.send('peer-typing', { upeerId: upeerId });
                break;
            case 'CHAT_CONTACT':
                handleChatContact(upeerId, data, win);
                break;
            case 'CHAT_REACTION':
                handleIncomingReaction(upeerId, data, win);
                break;
            case 'CHAT_UPDATE':
                handleIncomingUpdate(upeerId, contact, data, win, signature);
                break;
            case 'CHAT_DELETE':
                handleIncomingDelete(upeerId, data, win);
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
                fileTransferManager.handleMessage(upeerId, rinfo.address, data);
                break;
            case 'GROUP_MSG':
                handleGroupMessage(upeerId, contact, data, win, rinfo.address);
                break;
            case 'GROUP_ACK':
                handleGroupAck(upeerId, data, win);
                break;
            case 'GROUP_INVITE':
                handleGroupInvite(upeerId, data, win);
                break;
            case 'GROUP_UPDATE':
                handleGroupUpdate(upeerId, data, win);
                break;
            case 'GROUP_LEAVE':
                handleGroupLeave(upeerId, data, win);
                break;

            // ── Reputation Gossip (G-Set CRDT) ─────────────────────────────
            case 'REPUTATION_GOSSIP': {
                // Recibimos la lista de IDs que tiene el peer
                // → respondemos con los que nos faltan (máx 100)
                const ourIds = new Set(getGossipIds());
                const theirIds: string[] = data.ids ?? [];
                const missing = theirIds.filter(id => !ourIds.has(id)).slice(0, 100);
                if (missing.length > 0) {
                    sendResponse(rinfo.address, { type: 'REPUTATION_REQUEST', missing });
                }
                break;
            }
            case 'REPUTATION_REQUEST': {
                // El peer nos pide vouches que le faltan
                const requested: string[] = data.missing ?? [];
                const vouches = getVouchesForDelivery(requested);
                if (vouches.length > 0) {
                    sendResponse(rinfo.address, { type: 'REPUTATION_DELIVER', vouches });
                }
                break;
            }
            case 'REPUTATION_DELIVER': {
                // Recibimos vouches: verificar firma y persistir
                const received: any[] = data.vouches ?? [];
                for (const v of received) {
                    saveIncomingVouch(v).catch(() => { });
                }
                break;
            }

            default:
                warn('Unknown packet', { upeerId, type: data.type, ip: rinfo.address }, 'network');
        }
    } catch (e) {
        error('UDP Packet Error', e, 'network');
    }
}

async function handleDhtUpdate(upeerId: string, contact: any, data: any) {
    const block = data.locationBlock;
    if (!block || typeof block.dhtSeq !== 'number' || !block.address || !block.signature) return;

    const isValid = verifyLocationBlock(upeerId, block, contact.publicKey);
    if (!isValid) {
        security('Invalid DHT_UPDATE signature', { upeerId }, 'dht');
        return;
    }

    if (block.dhtSeq > (contact.dhtSeq || 0)) {
        network('Updating location', undefined, { upeerId, address: block.address, dhtSeq: block.dhtSeq }, 'dht');
        // BUG CG fix: pasar block.renewalToken para que no se pierda el token de renovación
        // automática. Sin esto, si el bloque expiraba después de recibirse vía DHT_UPDATE,
        // updateContactDhtLocation no lo guardaba y la renovación fallaba silenciosamente.
        updateContactDhtLocation(upeerId, block.address, block.dhtSeq, block.signature, block.expiresAt, block.renewalToken);
    }
}

async function handleDhtExchange(upeerId: string, data: any) {
    if (!Array.isArray(data.peers)) return;
    network('Receiving peer locations', undefined, { upeerId, count: data.peers.length }, 'dht');

    for (const peer of data.peers) {
        if (!peer.upeerId || !peer.publicKey || !peer.locationBlock) continue;
        if (peer.upeerId === getMyUPeerId()) continue;

        const existing = await getContactByUpeerId(peer.upeerId);
        if (!existing) continue;

        const block = peer.locationBlock;
        if (typeof block.dhtSeq !== 'number' || !block.address || !block.signature) continue;

        const isValid = verifyLocationBlock(peer.upeerId, block, existing.publicKey);
        if (!isValid) {
            security('Invalid PEEREX signature', { peerId: peer.upeerId }, 'dht');
            continue;
        }

        if (block.dhtSeq > (existing.dhtSeq || 0)) {
            // BUG CG fix: pasar block.renewalToken para preservar el token de renovación.
            updateContactDhtLocation(peer.upeerId, block.address, block.dhtSeq, block.signature, block.expiresAt, block.renewalToken);
        }
    }
}

async function handleDhtQuery(upeerId: string, data: any, fromAddress: string, sendResponse: (ip: string, data: any) => void) {
    network('DHT query', undefined, { requester: upeerId, target: data.targetId }, 'dht');
    const target = await getContactByUpeerId(data.targetId);

    let responseData: any = { type: 'DHT_RESPONSE', targetId: data.targetId };

    if (target && target.status === 'connected' && target.dhtSignature) {
        // BUG BX fix: incluir dhtExpiresAt en el locationBlock de respuesta.
        // verifyLocationBlock prueba primero con expiresAt; si el bloque fue firmado con
        // él (todos los modernos lo son) y la respuesta no lo incluye, la verificación falla.
        // BUG CG fix: incluir renewalToken para que el receptor pueda auto-renovar al expirar.
        responseData.locationBlock = {
            address: target.address,
            dhtSeq: target.dhtSeq,
            signature: target.dhtSignature,
            expiresAt: target.dhtExpiresAt ?? undefined,
            renewalToken: target.renewalToken
                ? (() => { try { return JSON.parse(target.renewalToken); } catch { return undefined; } })()
                : undefined
        };
        responseData.publicKey = target.publicKey;
    } else {
        const allContacts = getContacts() as any[];
        const distanceXOR = (idA: string, idB: string) => {
            try { return BigInt('0x' + idA) ^ BigInt('0x' + idB); }
            catch { return BigInt(0); }
        };

        const closest = allContacts
            .filter(c => c.status === 'connected' && c.upeerId !== upeerId)
            .map(c => ({
                upeerId: c.upeerId,
                publicKey: c.publicKey,
                // BUG BX fix: incluir expiresAt para que verifyLocationBlock en el receptor
                // pueda verificar correctamente bloques firmados con expiresAt.
                // BUG CG fix: incluir renewalToken para auto-renovación al expirar.
                locationBlock: {
                    address: c.address,
                    dhtSeq: c.dhtSeq,
                    signature: c.dhtSignature,
                    expiresAt: c.dhtExpiresAt ?? undefined,
                    renewalToken: c.renewalToken
                        ? (() => { try { return JSON.parse(c.renewalToken); } catch { return undefined; } })()
                        : undefined
                },
                dist: distanceXOR(c.upeerId, data.targetId)
            }))
            .sort((a, b) => (a.dist < b.dist ? -1 : a.dist > b.dist ? 1 : 0))
            .slice(0, 5)
            .map(({ dist, ...d }) => d);

        responseData.neighbors = closest;
    }
    sendResponse(fromAddress, responseData);
}

async function handleDhtResponse(upeerId: string, data: any, sendResponse: (ip: string, data: any) => void) {
    if (data.locationBlock) {
        const block = data.locationBlock;
        const existing = await getContactByUpeerId(data.targetId);
        if (!existing) return;

        const isValid = verifyLocationBlock(data.targetId, block, existing.publicKey || data.publicKey);
        if (isValid && block.dhtSeq > (existing.dhtSeq || 0)) {
            network('DHT search found', undefined, { target: data.targetId, address: block.address }, 'dht');
            // BUG CG fix: pasar block.renewalToken
            updateContactDhtLocation(data.targetId, block.address, block.dhtSeq, block.signature, block.expiresAt, block.renewalToken);
        }
    } else if (data.neighbors) {
        network('DHT search referrals', undefined, { requester: upeerId, target: data.targetId, count: data.neighbors.length }, 'dht');
        for (const peer of data.neighbors) {
            if (peer.upeerId === getMyUPeerId()) continue;
            const existing = await getContactByUpeerId(peer.upeerId);
            if (!existing) {
                if (peer.locationBlock?.address) {
                    sendResponse(peer.locationBlock.address, { type: 'DHT_QUERY', targetId: data.targetId });
                }
            } else if (peer.locationBlock?.dhtSeq > (existing.dhtSeq || 0)) {
                updateContactDhtLocation(peer.upeerId, peer.locationBlock.address, peer.locationBlock.dhtSeq, peer.locationBlock.signature, peer.locationBlock.expiresAt);
                sendResponse(peer.locationBlock.address, { type: 'DHT_QUERY', targetId: data.targetId });
            }
        }
    }
}

async function handleVaultDelivery(
    senderSid: string,
    data: any,
    win: BrowserWindow | null,
    sendResponse: (ip: string, data: any) => void,
    fromAddress: string
) {
    // BUG AJ fix: custodio malicioso podría enviar data.entries = null o un array
    // de 100 000 entradas, reventando el for-of o saturando CPU/mem en el loop.
    // Validar tipo y aplicar límite duro antes de iterar.
    if (!Array.isArray(data.entries)) {
        security('VAULT_DELIVERY: entries no es un array', { from: senderSid }, 'vault');
        return;
    }
    const MAX_DELIVERY_ENTRIES = 50; // igual que la paginación del custodio
    const entries = data.entries.slice(0, MAX_DELIVERY_ENTRIES);

    debug('Handling vault delivery', { count: entries.length, from: senderSid }, 'vault');

    issueVouch(senderSid, VouchType.VAULT_RETRIEVED).catch(() => { });

    // Solo ACK-ar entradas que pasaron integridad y fueron procesadas sin error.
    // Entradas corrompidas o manipuladas NO se ACKên → el custodio las conserva.
    const validatedHashes: string[] = [];
    try {
        for (const entry of entries) {
            try {
                const originalContact = await getContactByUpeerId(entry.senderSid);
                if (!originalContact) {
                    warn('Vault entry from unknown original sender', { senderSid: entry.senderSid }, 'vault');
                    continue;
                }

                let innerPacket: any = null;
                try {
                    innerPacket = JSON.parse(Buffer.from(entry.data, 'hex').toString());
                } catch (e) {
                    // Not a JSON packet, likely a raw shard
                }

                // If it's a signed inner packet (CHAT, FILE_DATA_SMALL, etc.)
                if (innerPacket && innerPacket.signature) {
                    const { signature: innerSig, senderUpeerId, ...innerData } = innerPacket;

                    // End-to-End Integrity Verification
                    const isInnerValid = verify(
                        Buffer.from(canonicalStringify(innerData)),
                        Buffer.from(innerSig, 'hex'),
                        Buffer.from(originalContact.publicKey!, 'hex')
                    );

                    if (!isInnerValid) {
                        security('Vault delivery integrity failure!', { originalSender: entry.senderSid, custodian: senderSid }, 'vault');
                        issueVouch(senderSid, VouchType.INTEGRITY_FAIL).catch(() => { });
                        continue;
                    }

                    // BUG FK fix: los inner packets de vault delivery saltaban validateMessage().
                    // Ed25519 garantiza autenticidad pero no validez estructural de los campos.
                    // Un contacto comprometido puede firmar un packet malformado que crashe handlers.
                    // Se valida aquí para los tipos que tienen validador; FILE_* y FILE_DATA_SMALL
                    // gestionan su propia validación en sus respectivos handlers.
                    const _vaultTypes = ['CHAT', 'GROUP_MSG', 'CHAT_DELETE', 'GROUP_INVITE', 'GROUP_UPDATE'];
                    if (_vaultTypes.includes(innerPacket.type)) {
                        const _innerValidation = validateMessage(innerPacket.type, innerPacket);
                        if (!_innerValidation.valid) {
                            security('Vault inner packet failed structural validation', { type: innerPacket.type, error: _innerValidation.error, sender: entry.senderSid }, 'vault');
                            continue;
                        }
                    }

                    if (innerPacket.type === 'CHAT') {
                        await handleChatMessage(entry.senderSid, originalContact, innerPacket, win, innerSig, fromAddress, sendResponse);
                    } else if (innerPacket.type === 'FILE_DATA_SMALL') {
                        // BUG FJ fix: innerPacket.fileHash se usaba directamente como ID de mensaje en DB
                        // sin validar el formato. Un peer puede enviar fileHash = UUID de otro mensaje
                        // y onConflictDoUpdate lo sobrescribe (message spoofing). SHA-256 = 64 hex chars.
                        if (typeof innerPacket.fileHash !== 'string' || !/^[0-9a-f]{64}$/i.test(innerPacket.fileHash)) {
                            security('Vault FILE_DATA_SMALL: fileHash inválido', { sender: entry.senderSid }, 'vault');
                            continue;
                        }
                        saveFileMessage(innerPacket.fileHash, entry.senderSid, false, {
                            fileHash: innerPacket.fileHash,
                            data: innerPacket.data,
                            state: 'completed'
                        } as any);
                    } else if (innerPacket.type.startsWith('FILE_')) {
                        fileTransferManager.handleMessage(entry.senderSid, fromAddress, innerPacket);
                    } else if (innerPacket.type === 'GROUP_MSG') {
                        await handleGroupMessage(entry.senderSid, originalContact, innerPacket, win);
                    } else if (innerPacket.type === 'CHAT_DELETE') {
                        // BUG CH fix: CHAT_DELETE vaulteado (resiliencia) nunca era entregado.
                        await handleIncomingDelete(entry.senderSid, innerPacket, win);
                    } else if (innerPacket.type === 'GROUP_INVITE') {
                        // BUG CH fix: GROUP_INVITE para offline nunca era procesado desde vault.
                        await handleGroupInvite(entry.senderSid, innerPacket, win);
                    } else if (innerPacket.type === 'GROUP_UPDATE') {
                        // BUG CP fix: GROUP_UPDATE vaulteado para offline nunca era despachado.
                        // La firma ya fue verificada arriba; se pasa entry.senderSid como
                        // senderUpeerId para que handleGroupUpdate pueda validar admin.
                        await handleGroupUpdate(entry.senderSid, innerPacket, win);
                    }
                } else {
                    // Raw Data / Shards
                    if (entry.payloadHash.startsWith('shard:')) {
                        debug('Received file shard from vault', { cid: entry.payloadHash }, 'vault');
                        issueVouch(senderSid, VouchType.VAULT_CHUNK).catch(() => { });

                        // For shards, we store them as assets. The fileHash is the middle part of CID.
                        const [_, fileHash, shardIndex] = entry.payloadHash.split(':');
                        if (fileHash && shardIndex) {
                            saveFileMessage(fileHash, entry.senderSid, false, {
                                fileHash,
                                shardIndex: parseInt(shardIndex),
                                data: entry.data,
                                state: 'completed'
                            } as any);
                        }
                    }
                }
                // Llegamos aquí sin 'continue' ni excepción → entrada procesada correctamente.
                validatedHashes.push(entry.payloadHash);
            } catch (err) {
                error('Failed to process delivered vault entry', err, 'vault');
            }
        }
    } catch (err) {
        error('Vault delivery processing failed', err, 'vault');
    }




    // ACK solo para entradas que pasaron integridad y fueron procesadas sin error.
    // Entradas con firma inválida o que lanzaron excepción NO se ACKên.
    if (validatedHashes.length > 0) {
        sendResponse(fromAddress, {
            type: 'VAULT_ACK',
            payloadHashes: validatedHashes
        });
    }

    // BUG O fix: si el custodio indicó que hay más entradas, solicitamos la siguiente página.
    // Sin esto, usuarios con >50 mensajes en vault solo reciben los primeros 50 y el resto
    // queda atrapado en el custodio para siempre.
    if (data.hasMore === true && typeof data.nextOffset === 'number') {
        const myId = getMyUPeerId();
        sendResponse(fromAddress, {
            type: 'VAULT_QUERY',
            requesterSid: myId,
            offset: data.nextOffset,
        });
        debug('Vault delivery: requesting next page', { offset: data.nextOffset, from: senderSid }, 'vault');
    }
}

export async function handleChatMessage(
    upeerId: string,
    contact: any,
    data: any,
    win: BrowserWindow | null,
    signature: any,
    fromAddress: string,
    sendResponse: (ip: string, data: any) => void
) {
    // BUG FS fix: validateChat valida data.id como string ≤ 100 chars pero no como UUID.
    // Igual que el bug FN en GROUP_MSG: si el id no es UUID válido, se genera uno nuevo
    // en lugar de persistir un string malformado como clave primaria en messages.
    const msgId = (data.id && _UUID_RE.test(String(data.id))) ? data.id : crypto.randomUUID();

    // Bug FI fix: validar ephemeralPublicKey como hex de 64 chars antes de persistir.
    if (data.ephemeralPublicKey && typeof data.ephemeralPublicKey === 'string' && /^[0-9a-f]{64}$/i.test(data.ephemeralPublicKey)) {
        updateContactEphemeralPublicKey(upeerId, data.ephemeralPublicKey);
    }

    let displayContent = data.content;
    if (data.ratchetHeader) {
        // ── Double Ratchet decrypt ───────────────────────────────────────────
        try {
            const { getRatchetSession, saveRatchetSession } = await import('../storage/ratchet/index.js');
            const { x3dhResponder, ratchetInitBob, ratchetDecrypt } = await import('../security/ratchet.js');
            const { getMyIdentitySkBuffer, getSpkBySpkId } = await import('../security/identity.js');

            let session = getRatchetSession(upeerId);

            if (!session && data.x3dhInit) {
                // Primer mensaje de Alice → X3DH como Bob
                const { ekPub, ikPub, spkId: usedSpkId } = data.x3dhInit;
                const aliceIkPk = Buffer.from(ikPub as string, 'hex');
                const aliceEkPk = Buffer.from(ekPub as string, 'hex');
                const bobIkSk = getMyIdentitySkBuffer();

                // Buscar el SPK correcto por ID (puede ser el actual o uno anterior si hubo rotación
                // mientras el peer estuvo offline). Cubre hasta 3 semanas de cobertura.
                const spkEntry = getSpkBySpkId(usedSpkId as number);
                if (!spkEntry) {
                    error('X3DH: SPK no encontrado por ID (rotación muy antigua)', { usedSpkId, upeerId }, 'security');
                    throw new Error('spk-not-found');
                }
                const { spkPk: bobSpkPk, spkSk: bobSpkSk } = spkEntry;

                const sharedSecret = x3dhResponder(bobIkSk, bobSpkSk, aliceIkPk, aliceEkPk);
                session = ratchetInitBob(sharedSecret, bobSpkPk, bobSpkSk);
                sharedSecret.fill(0);
            }

            if (session) {
                const plaintext = ratchetDecrypt(session, data.ratchetHeader, data.content, data.nonce);
                // BUG T fix: guardar la sesión SOLO cuando el descifrado fue exitoso.
                // ratchetDecrypt muta el estado interno (ckr, nr) antes de llamar a
                // secretbox_open_easy. Si guardamos tras un fallo, el estado avanzado
                // se persiste y los mensajes posteriores fallan con claves desincronizadas.
                // No guardar deja la BD en el último estado bueno (resistente a reinicios).
                if (plaintext) {
                    saveRatchetSession(upeerId, session);
                    displayContent = plaintext.toString('utf-8');
                } else {
                    displayContent = '🔒 [Error de descifrado DR]';
                    error('Double Ratchet decrypt returned null', { upeerId }, 'security');
                }
            } else {
                displayContent = '🔒 [Sin sesión Double Ratchet]';
            }
        } catch (err) {
            displayContent = '🔒 [Error crítico DR]';
            error('Double Ratchet decrypt failed', err, 'security');
        }
    } else if (data.nonce) {
        // ── Cifrado legacy crypto_box ────────────────────────────────────────
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

    // BUG P fix: saveMessage usa onConflictDoNothing() → si el mensaje ya existía, changes=0.
    // Sin esta comprobación, mensajes duplicados (entregados simultáneamente por dos custodios)
    // emiten 'receive-p2p-message' dos veces, causando duplicados visibles en la UI.
    const saved = saveMessage(msgId, upeerId, false, displayContent, data.replyTo, signature);
    const isNew = (saved as any)?.changes > 0;

    if (isNew) {
        win?.webContents.send('receive-p2p-message', {
            id: msgId,
            upeerId: upeerId,
            isMine: false,
            message: displayContent,
            replyTo: data.replyTo,
            status: 'received',
            encrypted: !!data.nonce
        });
    }

    // ACK siempre, incluso para duplicados: indica al custodio que el receptor ya lo tiene
    // y que puede borrar la entrada del vault (evita re-entregas infinitas).
    sendResponse(fromAddress, { type: 'ACK', id: msgId });
}

// Patrón UUID reutilizado en varios handlers para validar msgId/fileId de red.
const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * BUG CB fix: handler que nunca existió para CHAT_CONTACT.
 * El mensaje era enviado por sendContactCard() pero rechazado antes de llegar
 * al switch (validateMessage retornaba 'Unknown message type: CHAT_CONTACT').
 * Ahora validateMessage lo acepta y este handler lo procesa.
 */
function handleChatContact(
    upeerId: string,
    data: any,
    win: BrowserWindow | null
): void {
    const { id: msgId, contactName, contactAddress, upeerId: sharedUpeerId, contactPublicKey } = data;
    if (!msgId || !sharedUpeerId || !contactPublicKey) return;

    // Bug FD fix: validar msgId como UUID para evitar inyección de IDs arbitrarios en la DB.
    if (!_UUID_RE.test(String(msgId))) return;

    // Bug FF fix: limitar contactName a 100 chars y validar publicKey como hex de 64 chars
    // (clave Curve25519/Ed25519 de 32 bytes). Sin esto, un peer malicioso puede almacenar
    // strings arbitrarios (name de 10MB, publicKey='../../etc/passwd', etc.).
    const safeName = typeof contactName === 'string' ? contactName.slice(0, 100) : '';
    if (!/^[0-9a-f]{64}$/i.test(String(contactPublicKey))) return;

    // Guardar el mensaje en el historial de chat con el remitente
    const displayText = `CONTACT_CARD|${safeName || sharedUpeerId}`;
    saveMessage(msgId, upeerId, false, displayText, undefined, undefined, 'delivered');

    // Notificar al renderer para que muestre la tarjeta de contacto compartido
    win?.webContents.send('receive-p2p-message', {
        id: msgId,
        upeerId,
        isMine: false,
        message: displayText,
        status: 'delivered',
        contactCard: {
            upeerId: sharedUpeerId,
            name: safeName,
            address: contactAddress,
            publicKey: contactPublicKey,
        }
    });
}

export function handleAck(upeerId: string, data: any, win: BrowserWindow | null) {
    // Bug FE fix: data.id podría ser cualquier string arbitrario → solo procesar UUIDs válidos.
    if (data.id && _UUID_RE.test(String(data.id))) {
        updateMessageStatus(data.id, 'delivered');
        win?.webContents.send('message-delivered', { id: data.id, upeerId: upeerId });
    }
}

export function handleReadReceipt(upeerId: string, data: any, win: BrowserWindow | null) {
    // Bug FE fix: misma protección UUID que handleAck.
    if (data.id && _UUID_RE.test(String(data.id))) {
        updateMessageStatus(data.id, 'read');
        win?.webContents.send('message-read', { id: data.id, upeerId: upeerId });
    }
}

async function handleIncomingReaction(upeerId: string, data: any, win: BrowserWindow | null) {
    const { msgId, emoji, remove } = data;
    // Bug FC fix: sin estas comprobaciones un peer puede enviar un emoji de 10MB
    // (persistido en la tabla reactions) y msgIds arbitrarios que actúan como
    // inyección de identificadores en la DB.
    // Los emoji Unicode válidos tienen ≤ 8 code-points (con modificadores/ZWJ).
    if (typeof emoji !== 'string' || emoji.length > 32) return;
    if (!_UUID_RE.test(String(msgId))) return;
    if (remove) {
        deleteReaction(msgId, upeerId, emoji);
    } else {
        saveReaction(msgId, upeerId, emoji);
    }
    win?.webContents.send('message-reaction-updated', { msgId, upeerId, emoji, remove });
}

async function handleIncomingUpdate(upeerId: string, contact: any, data: any, win: BrowserWindow | null, signature: any) {
    const { msgId, content, nonce, ephemeralPublicKey, useRecipientEphemeral } = data;
    // BUG FO fix: validateChatUpdate solo limita msgId a 100 chars (no UUID regex).
    // Añadir _UUID_RE para garantizar que solo se intentan updates sobre IDs reales.
    if (!msgId || !_UUID_RE.test(String(msgId))) return;
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

    // BUG AC fix: sin esta comprobación cualquier peer conectado podía enviar
    // CHAT_UPDATE con el msgId de un mensaje de OTRO contacto y sobreescribirlo.
    // handleIncomingDelete ya tenía esta protección; aquí estaba ausente.
    const { getMessageById } = await import('../storage/db.js');
    const existingMsg = await getMessageById(msgId);
    if (existingMsg) {
        const isAuthorized = existingMsg.isMine
            ? false  // Nunca permitir que otro peer edite nuestros propios mensajes
            : existingMsg.chatUpeerId === upeerId;  // El sender debe ser el autor original
        if (!isAuthorized) {
            security('Unauthorized CHAT_UPDATE attempt!', { requester: upeerId, msgId }, 'security');
            issueVouch(upeerId, VouchType.MALICIOUS).catch(() => { });
            return;
        }
    }

    updateMessageContent(msgId, displayContent, signature);
    win?.webContents.send('message-updated', { id: msgId, upeerId, content: displayContent });
}

async function handleIncomingDelete(upeerId: string, data: any, win: BrowserWindow | null) {
    // BUG BZ-e fix: extraer solo los campos de metadatos (no firmados) dejando
    // signedFields = {type, msgId, timestamp} que coincide con lo que signó sendChatDelete.
    // Antes: `const { msgId, signature: deleteSig, ...deleteData } = data` dejaba
    // deleteData = {type, timestamp, senderUpeerId} (sin msgId, con senderUpeerId)
    // → la verificación contra canonicalStringify(deleteData) fallaba siempre.
    const { signature: deleteSig, senderUpeerId: _vaultSender, ...signedFields } = data;
    const msgId: string | undefined = signedFields.msgId;
    // BUG FP fix: validateChatDelete solo limita msgId a 100 chars (no UUID regex).
    // Añadir _UUID_RE para descartar IDs malformados antes de consultar la DB.
    if (!msgId || !_UUID_RE.test(String(msgId))) return;

    const contact = await getContactByUpeerId(upeerId);
    if (!contact || !contact.publicKey) {
        warn('Delete request from unknown or unkeyed contact', { upeerId }, 'security');
        return;
    }

    // BUG BZ fix: la firma exterior de handlePacket ya autenticó al remitente.
    // Para entrega directa, `data` llega SIN campo `signature` (extraído arriba
    // por el desempaquetado del paquete exterior). Solo verificar la firma interior
    // cuando existe, lo que ocurre únicamente en el flujo de vault delivery.
    if (deleteSig) {
        const { verify } = await import('../security/identity.js');
        const { canonicalStringify } = await import('./utils.js');
        const isValid = verify(
            Buffer.from(canonicalStringify(signedFields)),
            Buffer.from(deleteSig, 'hex'),
            Buffer.from(contact.publicKey, 'hex')
        );
        if (!isValid) {
            security('INVALID delete request signature!', { upeerId, msgId }, 'security');
            issueVouch(upeerId, VouchType.INTEGRITY_FAIL).catch(() => { });
            return;
        }
    }

    // 2. Authorization Check (Sender or Recipient)
    const { getMessageById } = await import('../storage/db.js');
    const existingMsg = await getMessageById(msgId);

    if (existingMsg) {
        // Only allow delete if it's our own message or if it was sent TO us by the requester
        const isAuthorized = existingMsg.isMine || existingMsg.chatUpeerId === upeerId;

        if (!isAuthorized) {
            security('Unauthorized delete attempt!', { requester: upeerId, msgId }, 'security');
            issueVouch(upeerId, VouchType.MALICIOUS).catch(() => { });
            return;
        }
    }

    // 3. Perform Deletion
    deleteMessageLocally(msgId);
    win?.webContents.send('message-deleted', { id: msgId, upeerId });

    debug('Message deleted via P2P command', { msgId, requester: upeerId }, 'network');
}

// ========================
// Group Message Handlers
// ========================

async function handleGroupMessage(
    upeerId: string,
    contact: any,
    data: any,
    win: BrowserWindow | null,
    senderAddress?: string
) {
    const { id, groupId, groupName, content, nonce, ephemeralPublicKey, useRecipientEphemeral, replyTo } = data;
    if (!groupId || !content) return;

    // BUG CA fix: si el grupo no existe localmente, rechazar el mensaje en lugar
    // de crear un grupo fantasma. Un peer arbitrario podía enviar GROUP_MSG con
    // un groupId desconocido y auto-crearse miembro, pasando el check de membresía
    // (que justo después añade al sender como único miembro). Sólo aceptar mensajes
    // de grupos en los que ya estamos — la invitación llega siempre via GROUP_INVITE.
    const existingGroup = getGroupById(groupId);
    if (!existingGroup) {
        security('GROUP_MSG para grupo desconocido — rechazado', { sender: upeerId, groupId }, 'security');
        return;
    }

    // Security check: Is the sender a member of the group?
    if (!existingGroup.members.includes(upeerId)) {
        security('Unauthorized group message!', { sender: upeerId, groupId }, 'security');
        issueVouch(upeerId, VouchType.MALICIOUS).catch(() => { });
        return;
    }

    // BUG FN fix: data.id (campo opcional) se usaba directamente como msgId de BD
    // sin validar el formato UUID. Un peer puede enviar id="<SQL injection attempt>"
    // o un string con el UUID exacto de un mensaje existente para intentar colisionar
    // (saveMessage usa onConflictDoNothing, pero el ID malformado queda en la DB).
    const msgId = (id && _UUID_RE.test(String(id))) ? id : crypto.randomUUID();

    let displayContent = content;
    if (nonce) {
        try {
            const { decrypt } = await import('../security/identity.js');
            const senderKeyHex = useRecipientEphemeral ? ephemeralPublicKey : contact.publicKey;
            if (senderKeyHex) {
                const decrypted = decrypt(
                    Buffer.from(content, 'hex'),
                    Buffer.from(nonce, 'hex'),
                    Buffer.from(senderKeyHex, 'hex'),
                    !!useRecipientEphemeral
                );
                if (decrypted) displayContent = decrypted.toString('utf-8');
                else displayContent = '🔒 [Error de descifrado]';
            }
        } catch (err) {
            displayContent = '🔒 [Error crítico de seguridad]';
        }
    }

    // BUG AB fix: igual que BUG P (ya corregido para CHAT), los mensajes de grupo
    // entregados por múltiples custodios simultáneamente llegaban aquí dos veces
    // con el mismo msgId. saveMessage usa onConflictDoNothing → changes=0 en la segunda
    // llamada, pero la emit 'receive-group-message' se hacía igualmente → duplicados en UI.
    const savedGroup = saveMessage(msgId, groupId, false, displayContent, replyTo, undefined, 'delivered');
    const isNewGroupMsg = (savedGroup as any)?.changes > 0;

    // Notify sender that we received the message
    const ackAddress = senderAddress || contact?.address;
    if (ackAddress) {
        const { sendSecureUDPMessage } = await import('./server.js');
        sendSecureUDPMessage(ackAddress, { type: 'GROUP_ACK', id: msgId, groupId });
    }

    if (isNewGroupMsg) {
        win?.webContents.send('receive-group-message', {
            id: msgId,
            groupId,
            senderUpeerId: upeerId,
            senderName: contact.name,
            isMine: false,
            message: displayContent,
            replyTo,
            status: 'delivered'
        });
    }
}

function handleGroupAck(upeerId: string, data: any, win: BrowserWindow | null) {
    const { id: msgId, groupId } = data;
    // Bug FE fix: misma protección UUID aplicada a los ACKs de grupo.
    if (!msgId || !_UUID_RE.test(String(msgId))) return;
    updateMessageStatus(msgId, 'delivered');
    win?.webContents.send('group-message-delivered', { id: msgId, groupId, upeerId });
}

async function handleGroupInvite(
    upeerId: string,
    data: any,
    win: BrowserWindow | null
) {
    const { groupId, adminUpeerId } = data;
    if (!groupId || !data.payload || !data.nonce) return;

    // --- Decrypt E2E payload ---
    let groupName: string;
    let members: string[];
    let avatar: string | undefined;

    try {
        const senderKey = (await getContactByUpeerId(upeerId))?.publicKey;
        if (!senderKey) {
            security('GROUP_INVITE: no sender key to decrypt', { upeerId }, 'security');
            return;
        }
        const decrypted = decrypt(
            Buffer.from(data.payload, 'hex'),
            Buffer.from(data.nonce, 'hex'),
            Buffer.from(senderKey, 'hex'),
            !!data.useRecipientEphemeral
        );
        if (!decrypted) {
            security('GROUP_INVITE: decryption failed', { upeerId, groupId }, 'security');
            return;
        }
        const inner = JSON.parse(decrypted.toString('utf-8'));
        groupName = inner.groupName;
        members = inner.members;
        // Bug FG fix: validar avatar igual que en HANDSHAKE/PING: data URI válida y ≤ 2 MB.
        if (
            typeof inner.avatar === 'string' &&
            inner.avatar.startsWith('data:image/') &&
            inner.avatar.length <= 2_000_000
        ) {
            avatar = inner.avatar;
        }
    } catch {
        security('GROUP_INVITE: parse error after decrypt', { upeerId }, 'security');
        return;
    }

    if (!groupName) return;

    // BUG DE fix: groupName del payload descifrado no tenía cap de longitud.
    // Un admin puede enviar hasta ~250KB de groupName (dentro del límite de 500KB
    // del outer payload) → almacenado en la tabla groups sin restricción.
    if (typeof groupName !== 'string' || groupName.length > 100) {
        security('GROUP_INVITE: groupName inválido o demasiado largo', { upeerId }, 'security');
        return;
    }
    // BUG DF fix: members sin tope de tamaño. Con payload 500KB se pueden embeber
    // hasta ~7800 upeerIds (32 chars c/u) → todos serializados en groups.members.
    if (!Array.isArray(members) || members.length > 500) {
        security('GROUP_INVITE: lista de members inválida o demasiado grande', { upeerId }, 'security');
        return;
    }

    // Security check: sender must be the claimed admin
    const actualAdmin = adminUpeerId || upeerId;
    if (upeerId !== actualAdmin) {
        security('Identity mismatch in group invite!', { sender: upeerId, claimedAdmin: adminUpeerId }, 'security');
        issueVouch(upeerId, VouchType.MALICIOUS).catch(() => { });
        return;
    }

    const existing = getGroupById(groupId);
    if (!existing) {
        saveGroup(groupId, groupName, actualAdmin, members || [upeerId], 'active', avatar);
    } else {
        if (!existing.members.includes(upeerId)) {
            security('Group invite from non-member!', { sender: upeerId, groupId }, 'security');
            issueVouch(upeerId, VouchType.MALICIOUS).catch(() => { });
            return;
        }
    }

    win?.webContents.send('group-invite-received', {
        groupId,
        groupName,
        adminUpeerId: actualAdmin,
        members: members || []
    });
}

// End of file

async function handleGroupUpdate(
    senderUpeerId: string,
    data: any,
    win: BrowserWindow | null
) {
    const { groupId, adminUpeerId } = data;
    if (!groupId) return;

    const group = getGroupById(groupId);
    if (!group) return;

    // Solo el admin puede emitir cambios
    const claimedAdmin = adminUpeerId || senderUpeerId;
    if (group.adminUpeerId !== claimedAdmin || senderUpeerId !== claimedAdmin) {
        security('GROUP_UPDATE de no-admin ignorado', { sender: senderUpeerId, groupId }, 'security');
        return;
    }

    // --- Decrypt E2E payload ---
    if (!data.payload || !data.nonce) return;
    let fields: { name?: string; avatar?: string | null } = {};

    try {
        const senderKey = (await getContactByUpeerId(senderUpeerId))?.publicKey;
        if (!senderKey) return;
        const decrypted = decrypt(
            Buffer.from(data.payload, 'hex'),
            Buffer.from(data.nonce, 'hex'),
            Buffer.from(senderKey, 'hex'),
            !!data.useRecipientEphemeral
        );
        if (!decrypted) {
            security('GROUP_UPDATE: decryption failed', { senderUpeerId, groupId }, 'security');
            return;
        }
        const inner = JSON.parse(decrypted.toString('utf-8'));
        // BUG DG fix: groupName sin cap de longitud → hasta 250KB almacenado en groups.name.
        if (inner.groupName && typeof inner.groupName === 'string' && inner.groupName.length <= 100) fields.name = inner.groupName;
        // Bug FH fix: avatar del payload descifrado sin validación de tipo/tamaño.
        // null = quitar avatar; string con data URI válida ≤ 2MB = actualizar.
        if (inner.avatar === null) {
            fields.avatar = null;
        } else if (
            typeof inner.avatar === 'string' &&
            inner.avatar.startsWith('data:image/') &&
            inner.avatar.length <= 2_000_000
        ) {
            fields.avatar = inner.avatar;
        }
    } catch {
        security('GROUP_UPDATE: parse error', { senderUpeerId }, 'security');
        return;
    }

    if (Object.keys(fields).length === 0) return;

    updateGroupInfo(groupId, fields);

    win?.webContents.send('group-updated', {
        groupId,
        ...(fields.name !== undefined ? { name: fields.name } : {}),
        ...(fields.avatar !== undefined ? { avatar: fields.avatar } : {}),
    });
}

async function handleGroupLeave(
    upeerId: string,
    data: any,
    win: BrowserWindow | null
) {
    const { groupId, signature: leaveSig, ...leaveData } = data;
    if (!groupId) return;

    const contact = await getContactByUpeerId(upeerId);
    if (!contact?.publicKey) {
        warn('GROUP_LEAVE from unknown contact', { upeerId }, 'security');
        return;
    }

    // BUG BZ fix: la firma exterior de handlePacket ya autenticó al remitente.
    // `leaveSig` solo está presente en el flujo de vault delivery.
    // Para entrega directa, confiar en la verificación exterior.
    if (leaveSig) {
        const { verify } = await import('../security/identity.js');
        const { canonicalStringify } = await import('./utils.js');
        const isValid = verify(
            Buffer.from(canonicalStringify(leaveData)),
            Buffer.from(leaveSig, 'hex'),
            Buffer.from(contact.publicKey, 'hex')
        );
        if (!isValid) {
            security('Invalid GROUP_LEAVE signature', { upeerId, groupId }, 'security');
            return;
        }
    }

    const group = getGroupById(groupId);
    if (!group) return;

    // Remove the leaving member from the roster
    const newMembers = group.members.filter(m => m !== upeerId);
    updateGroupMembers(groupId, newMembers);

    // Save a system message "X dejó el grupo" (prefixed so it can be detected when loading from DB)
    const senderName = contact.name || upeerId;
    const systemMsgId = crypto.randomUUID();
    const systemText = `${senderName} dejó el grupo`;
    saveMessage(systemMsgId, groupId, false, `__SYS__|${systemText}`, undefined, undefined, 'delivered');

    // Notify renderer: refresh members + show system message in chat
    win?.webContents.send('group-updated', { groupId, members: newMembers });
    win?.webContents.send('receive-group-message', {
        id: systemMsgId,
        groupId,
        senderUpeerId: upeerId,
        senderName: null,
        isMine: false,
        message: systemText,
        status: 'delivered',
        isSystem: true,
    });
}
