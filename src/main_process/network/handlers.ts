import { BrowserWindow } from 'electron';

import type { NetworkPacket } from './types.js';

import { IdentityRateLimiter } from '../security/identity-rate-limiter.js';
import {
    decryptSealed,
    verify
} from '../security/identity.js';

import { debug, error, security } from '../security/secure-logger.js';
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
import { handleHandshakeAccept, handleHandshakeReq } from './handlers/contacts.js';
import { unsealPacket } from './sealed.js';
import { canonicalStringify } from './utils.js';
import { routeVerifiedPacket } from './verifiedPacketRouter.js';

const rateLimiter = new IdentityRateLimiter();

/** BUG AP fix: exponer cleanup para que server.ts lo llame cada hora. */
export function cleanupRateLimiter(): void {
    rateLimiter.cleanup();
}

export async function handlePacket(
    msg: Buffer,
    rinfo: { address: string; port: number },
    win: BrowserWindow | null,
    sendResponse: (ip: string, data: NetworkPacket) => void,
    startDhtSearch: (upeerId: string) => void
) {
    try {
        const fullPacketRaw: unknown = JSON.parse(msg.toString());

        if (typeof fullPacketRaw !== 'object' || fullPacketRaw === null) {
            security('Invalid packet format', { ip: rinfo.address }, 'network');
            return;
        }

        const fullPacket = fullPacketRaw as NetworkPacket;

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
            const inner = unsealPacket(fullPacket, (ct) => decryptSealed(ct));
            if (!inner) {
                security('SEALED: failed to decrypt', { ip: rinfo.address }, 'network');
                return;
            }
            // Re-procesar el inner packet como si hubiera llegado directamente
            return handlePacket(Buffer.from(JSON.stringify(inner)), rinfo, win, sendResponse, startDhtSearch);
        }

        const { signature, senderUpeerId, senderYggAddress, ...data } = fullPacket;

        const dataPacket = { ...data, type: fullPacket.type } as NetworkPacket;

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
        const validation = validateMessage(dataPacket.type, dataPacket);
        if (!validation.valid) {
            if (dataPacket.type === 'FILE_CHUNK' || dataPacket.type === 'FILE_ACK' || dataPacket.type === 'FILE_PROPOSAL') {
                debug('FILE_* validation rejected', {
                    type: dataPacket.type,
                    fileId: (dataPacket as { fileId?: string }).fileId,
                    chunkIndex: (dataPacket as { chunkIndex?: number }).chunkIndex,
                    error: validation.error
                }, 'file-transfer');
            }
            security('Invalid message', { ip: rinfo.address, type: dataPacket.type, error: validation.error }, 'network');
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

        // 1b. DHT — infraestructura de red abierta, no requiere contacto conectado.
        // El handler DHT tiene su propia validación de firmas y secuencias internamente.
        if (data.type.startsWith('DHT_') && senderUpeerId) {
            const kademliaHandled = await handleDhtPacket(
                data.type,
                data,
                senderUpeerId,
                rinfo.address,
                win,
                sendResponse
            );
            if (kademliaHandled) return;
        }

        // 2. SECURITY CHECK
        const upeerId = senderUpeerId;
        if (!upeerId) return;

        const contact = await getContactByUpeerId(upeerId);
        if (!contact || !contact.publicKey || contact.status === 'blocked') {
            security('Origin unknown, blocked or missing key', { upeerId, ip: rinfo.address, type: data.type }, 'network');
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
        const payloadForVerification: NetworkPacket = { ...dataForVerification as NetworkPacket, senderUpeerId };
        if (senderYggAddress !== undefined) {
            payloadForVerification.senderYggAddress = senderYggAddress;
        }

        if (!signature || typeof signature !== 'string') {
            security('Packet missing signature', { ip: rinfo.address, upeerId, type: data.type }, 'network');
            return;
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

        await routeVerifiedPacket({
            upeerId,
            contact,
            data,
            signature,
            rinfo,
            win,
            sendResponse,
        });
    } catch (e) {
        error('UDP Packet Error', e, 'network');
    }
}