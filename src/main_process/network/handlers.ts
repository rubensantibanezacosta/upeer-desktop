import { BrowserWindow } from 'electron';

import type { NetworkPacket } from './types.js';

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
    updateContactStatus,
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

function queryOwnVaultsOnReconnect(upeerId: string): void {
    import('./vault/manager.js').then(({ VaultManager }) => {
        VaultManager.queryOwnVaults();
    }).catch((err) => {
        warn('Failed to query own vaults after reconnect', { upeerId, err: String(err) }, 'vault');
    });
}

function isReconnectState(status: unknown): boolean {
    return status === 'offline' || status === 'disconnected';
}

type PacketRecord = Record<string, unknown>;

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

        const fullPacket = fullPacketRaw as PacketRecord;

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
            const inner = unsealPacket(fullPacket as { ciphertext: string }, (ct) => decryptSealed(ct));
            if (!inner) {
                security('SEALED: failed to decrypt', { ip: rinfo.address }, 'network');
                return;
            }
            // Re-procesar el inner packet como si hubiera llegado directamente
            return handlePacket(Buffer.from(JSON.stringify(inner)), rinfo, win, sendResponse, startDhtSearch);
        }

        const signature = typeof fullPacket.signature === 'string' ? fullPacket.signature : undefined;
        const senderUpeerId = typeof fullPacket.senderUpeerId === 'string' ? fullPacket.senderUpeerId : undefined;
        const senderYggAddress = typeof fullPacket.senderYggAddress === 'string' ? fullPacket.senderYggAddress : undefined;
        const rawType = typeof fullPacket.type === 'string' ? fullPacket.type : '';

        const data: PacketRecord = {};
        for (const key of Object.keys(fullPacket)) {
            if (key !== 'signature' && key !== 'senderUpeerId' && key !== 'senderYggAddress') {
                data[key] = fullPacket[key];
            }
        }
        data.type = rawType;

        // BUG CM fix: guardar la IP de transporte TCP real ANTES del override.
        const tcpSourceAddress = rinfo.address;

        // ── Anti-Spoofing & Proxy Detection ──
        const isLocalSource = tcpSourceAddress === '127.0.0.1' || tcpSourceAddress === '::1';
        if (senderYggAddress && /^[23][0-9a-f]{2}:/i.test(senderYggAddress)) {
            if (isLocalSource) {
                rinfo = { ...rinfo, address: senderYggAddress };
            }
        }

        const pktType = String(data.type);

        // Special logging for FILE_CHUNK
        if (pktType === 'FILE_CHUNK') {
            debug('FILE_CHUNK received', {
                fileId: data.fileId,
                chunkIndex: data.chunkIndex,
                totalChunks: data.totalChunks,
                dataSize: (data as { data?: { length?: number } }).data?.length
            }, 'file-transfer');
        }

        // Rate limiting check
        if (!pktType) {
            security('Packet missing type', { ip: tcpSourceAddress }, 'network');
            return;
        }
        if (!rateLimiter.checkIp(tcpSourceAddress, pktType)) {
            return;
        }

        // Input validation
        const validation = validateMessage(pktType, data as NetworkPacket);
        if (!validation.valid) {
            if (pktType === 'FILE_CHUNK' || pktType === 'FILE_ACK' || pktType === 'FILE_PROPOSAL' || pktType === 'FILE_START') {
                debug('FILE_* validation rejected', {
                    type: pktType,
                    fileId: data.fileId as string | undefined,
                    chunkIndex: data.chunkIndex as number | undefined,
                    error: validation.error
                }, 'file-transfer');
            }
            security('Invalid message', { ip: rinfo.address, type: pktType, error: validation.error }, 'network');
            return;
        }

        // 1. HANDSHAKE
        if (pktType === 'HANDSHAKE_REQ') {
            await handleHandshakeReq(data as NetworkPacket, signature ?? '', senderUpeerId ?? '', senderYggAddress ?? '', rinfo, win, sendResponse as (ip: string, data: Record<string, unknown>) => void, tcpSourceAddress);
            return;
        }

        if (pktType === 'HANDSHAKE_ACCEPT') {
            await handleHandshakeAccept(data as NetworkPacket, signature ?? '', senderUpeerId ?? '', senderYggAddress ?? '', rinfo, win, sendResponse as (ip: string, data: Record<string, unknown>) => void, tcpSourceAddress);
            return;
        }

        // 1b. DHT
        if (pktType.startsWith('DHT_') && senderUpeerId) {
            const kademliaHandled = await handleDhtPacket(
                pktType,
                data as NetworkPacket,
                senderUpeerId,
                rinfo.address,
                win,
                sendResponse as any
            );
            if (kademliaHandled) return;
        }

        // 2. SECURITY CHECK
        const upeerId = senderUpeerId;
        if (!upeerId) return;

        const contact = await getContactByUpeerId(upeerId) as { publicKey?: string; status?: string; address?: string } | undefined;
        if (!contact || !contact.publicKey || contact.status === 'blocked') {
            security('Origin unknown, blocked or missing key', { upeerId, ip: rinfo.address, type: pktType }, 'network');
            return;
        }

        // Debug logging for FILE_CHUNK
        if (pktType === 'FILE_CHUNK') {
            debug('FILE_CHUNK pre-verify', { fileId: data.fileId, chunkIndex: data.chunkIndex }, 'file-transfer');
        }

        // Exclude fields not part of signature
        const fieldsToExclude = ['contactCache', 'renewalToken'];
        const dataForVerification: PacketRecord = { ...data };
        fieldsToExclude.forEach(field => { delete dataForVerification[field]; });

        const payloadForVerification: PacketRecord = { ...dataForVerification, senderUpeerId };
        if (senderYggAddress !== undefined) {
            payloadForVerification.senderYggAddress = senderYggAddress;
        }

        if (!signature || typeof signature !== 'string') {
            security('Packet missing signature', { ip: rinfo.address, upeerId, type: pktType }, 'network');
            return;
        }

        let verified = verify(
            Buffer.from(canonicalStringify(payloadForVerification)),
            Buffer.from(signature, 'hex'),
            Buffer.from(contact.publicKey, 'hex')
        );
        if (!verified && senderYggAddress !== undefined) {
            const legacyPayload: PacketRecord = { ...dataForVerification, senderUpeerId };
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
                type: pktType,
                payload: canonicalStringify(payloadForVerification),
                fullPacket
            }, 'network');
            return;
        } else if (pktType === 'FILE_CHUNK') {
            debug('FILE_CHUNK signature verified', { fileId: data.fileId, chunkIndex: data.chunkIndex }, 'file-transfer');
        }

        // Apply identity-based rate limiting
        if (!rateLimiter.checkIdentity(rinfo.address, upeerId, pktType)) {
            return;
        }

        // 3. SOVEREIGN ROAMING
        const YGG_ADDR_RE = /^[23][0-9a-f]{2}:/i;
        if (contact.address !== rinfo.address && YGG_ADDR_RE.test(rinfo.address)) {
            updateContactLocation(upeerId, rinfo.address);
        }

        const nowIso = new Date().toISOString();
        if (isReconnectState(contact.status)) {
            updateContactStatus(upeerId, 'connected');
            queryOwnVaultsOnReconnect(upeerId);
        }
        updateLastSeen(upeerId);
        win?.webContents.send('contact-presence', {
            upeerId,
            lastSeen: nowIso,
            alias: data.alias as string | undefined,
            avatar: data.avatar as string | undefined,
        });

        await routeVerifiedPacket({
            upeerId,
            contact: contact as { publicKey: string; signedPreKeyId?: number | null; name?: string; alias?: string; address?: string },
            data: data as NetworkPacket,
            signature,
            rinfo,
            win,
            sendResponse: sendResponse as (ip: string, data: Record<string, unknown>) => void,
        });
    } catch (e) {
        error('UDP Packet Error', e, 'network');
    }
}