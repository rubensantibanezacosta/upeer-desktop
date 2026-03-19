import { BrowserWindow } from 'electron';


import { IdentityRateLimiter } from '../security/identity-rate-limiter.js';
import {
    decryptSealed,
    verify
} from '../security/identity.js';

import { debug, error, security, warn } from '../security/secure-logger.js';
import { validateMessage } from '../security/validation.js';
import {
    getContactByUpeerId,
} from '../storage/contacts/operations.js';
import {
    updateContactLocation,
} from '../storage/contacts/location.js';
import {
    updateLastSeen
} from '../storage/contacts/status.js';

import { handleDhtPacket } from './dht/handlers.js';
import { fileTransferManager } from './file-transfer/transfer-manager.js';

// Import modular handlers
import { handleChatAck, handleChatMessage, handleChatEdit, handleChatDelete, handleChatReaction } from './handlers/chat.js';
import { handleHandshakeAccept, handleHandshakeReq } from './handlers/contacts.js';
import { handleGroupAck, handleGroupInvite, handleGroupLeave, handleGroupMessage, handleGroupUpdate } from './handlers/groups.js';
import { handleReputationDeliver, handleReputationGossip, handleReputationRequest } from './handlers/reputation.js';
import { handleVaultDelivery } from './handlers/vault.js';
import { unsealPacket } from './sealed.js';
import { canonicalStringify } from './utils.js';

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

        // ── Anti-Spoofing & Proxy Detection ──
        // Si el tráfico viene de localhost, es un forward de yggstack. Usamos senderYggAddress.
        // Si viene de una IP remota, preferimos responder a la IP de transporte real 
        // para evitar ataques de reflexión (hacer que enviemos PONG/ACCEPT a una víctima).
        const isLocalSource = tcpSourceAddress === '127.0.0.1' || tcpSourceAddress === '::1';
        if (senderYggAddress && /^[23][0-9a-f]{2}:/i.test(senderYggAddress)) {
            if (isLocalSource) {
                rinfo = { ...rinfo, address: senderYggAddress };
            }
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
            await handleHandshakeReq(data, signature, senderUpeerId, senderYggAddress, rinfo, win, sendResponse, tcpSourceAddress);
            return;
        }

        if (data.type === 'HANDSHAKE_ACCEPT') {
            await handleHandshakeAccept(data, signature, senderUpeerId, senderYggAddress, rinfo, win, sendResponse, tcpSourceAddress);
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
        const payloadForVerification: any = { ...dataForVerification, senderUpeerId };
        if (senderYggAddress !== undefined) {
            payloadForVerification.senderYggAddress = senderYggAddress;
        }

        let verified = verify(
            Buffer.from(canonicalStringify(payloadForVerification)),
            Buffer.from(signature, 'hex'),
            Buffer.from(contact.publicKey, 'hex')
        );
        if (!verified && senderYggAddress !== undefined) {
            // Fallback: maybe it was signed without senderYggAddress despite being present
            const legacyPayload = { ...dataForVerification, senderUpeerId };
            verified = verify(
                Buffer.from(canonicalStringify(legacyPayload)),
                Buffer.from(signature, 'hex'),
                Buffer.from(contact.publicKey, 'hex')
            );
        }

        if (!verified) {
            security('Invalid signature', {
                upeerId,
                ip: rinfo.address,
                type: data.type,
                payload: canonicalStringify(payloadForVerification),
                fullPacket
            }, 'network');
            return;
        }
        else if (data.type === 'FILE_CHUNK') {
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
                    import('../storage/contacts/operations.js').then(({ updateContactName }) => {
                        updateContactName?.(upeerId, (data.alias as string).slice(0, 100));
                    }).catch((err) => warn('Failed to update contact name', err, 'network'));
                }
                if (data.avatar && typeof data.avatar === 'string' && data.avatar.startsWith('data:image/') && data.avatar.length <= 2_000_000) {
                    import('../storage/contacts/operations.js').then(({ updateContactAvatar }) => {
                        updateContactAvatar?.(upeerId, data.avatar);
                    }).catch(() => { });
                }
                break;
            case 'PONG':
                // Presence is already updated by updateLastSeen(upeerId) above
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
                handleChatAck(upeerId, data, win);
                break;
            case 'READ':
                handleChatAck(upeerId, { ...data, status: 'read' }, win);
                break;
            case 'TYPING':
                win?.webContents.send('peer-typing', { upeerId: upeerId });
                break;
            case 'CHAT_CONTACT':
                // handleChatContact(upeerId, data, win); // Dejado para implementar o redirigir
                break;
            case 'CHAT_REACTION':
                handleChatReaction(upeerId, data, win);
                break;
            case 'CHAT_UPDATE':
                handleChatEdit(upeerId, data, win, signature);
                break;
            case 'CHAT_DELETE':
                handleChatDelete(upeerId, data, win);
                break;
            case 'CHAT_CLEAR_ALL':
                {
                    const { handleChatClear } = await import('./handlers/chat.js');
                    handleChatClear(upeerId, data, win);
                }
                break;
            case 'IDENTITY_UPDATE':
                // Sincronización de perfil entre nuestros propios dispositivos
                if (upeerId === (await import('../security/identity.js')).getMyUPeerId()) {
                    const { setMyAlias, setMyAvatar } = await import('../security/identity.js');
                    if (data.alias) setMyAlias(data.alias);
                    if (data.avatar) setMyAvatar(data.avatar);
                    // Notificar a la UI local que nuestra identidad cambió
                    win?.webContents.send('identity-updated', { alias: data.alias, avatar: data.avatar });
                }
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
            case 'REPUTATION_GOSSIP':
                handleReputationGossip(upeerId, data, sendResponse, rinfo);
                break;
            case 'REPUTATION_REQUEST':
                handleReputationRequest(upeerId, data, sendResponse, rinfo);
                break;
            case 'REPUTATION_DELIVER':
                handleReputationDeliver(upeerId, data);
                break;

            default:
                warn('Unknown packet', { upeerId, type: data.type, ip: rinfo.address }, 'network');
        }
    } catch (e) {
        error('UDP Packet Error', e, 'network');
    }
}