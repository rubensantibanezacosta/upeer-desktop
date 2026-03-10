
import { BrowserWindow } from 'electron';
import {
    getContactByUpeerId,
    addOrUpdateContact,
    deleteContact,
    isContactBlocked,
    updateContactPublicKey,
    updateContactEphemeralPublicKey,
    getContactByAddress,
} from '../../storage/db.js';
import {

    verify,
    getUPeerIdFromPublicKey,
} from '../../security/identity.js';
import { AdaptivePow } from '../../security/pow.js';
import { canonicalStringify } from '../utils.js';
import { issueVouch, VouchType, computeScore } from '../../security/reputation/vouches.js';
import { network, security, error } from '../../security/secure-logger.js';
import { IdentityRateLimiter } from '../../security/identity-rate-limiter.js';

// Rate limiter instance (shared with core)
const rateLimiter = new IdentityRateLimiter();

export async function handleHandshakeReq(
    data: any,
    signature: string,
    senderUpeerId: string,
    senderYggAddress: string,
    rinfo: { address: string; port: number },
    win: BrowserWindow | null,
    _sendResponse: (ip: string, data: any) => void,
    _tcpSourceAddress: string
): Promise<void> {
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
    const { getContacts: _gc } = await import('../../storage/db.js').catch(() => ({ getContacts: () => [] })) as any;
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
        import('../../storage/contacts/keys.js').then(({ computeKeyFingerprint }) => {
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
                    import('../../storage/contacts/keys.js').then(({ updateContactSignedPreKey }) => {
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
        import('../../storage/db.js').then(({ updateContactAvatar }) => {
            updateContactAvatar?.(senderUpeerId, data.avatar);
        }).catch(() => { });
    }

    if (isAlreadyConnected) {
        // If they re-request connection but are already accepted, silently accept and refresh presence
        win?.webContents.send('contact-presence', { upeerId: senderUpeerId, lastSeen: new Date().toISOString() });

        import('../server/index.js').then(({ acceptContactRequest }) => {
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
}

export async function handleHandshakeAccept(
    data: any,
    signature: string,
    senderUpeerId: string,
    senderYggAddress: string,
    rinfo: { address: string; port: number },
    win: BrowserWindow | null,
    _sendResponse: (ip: string, data: any) => void,
    _tcpSourceAddress: string
): Promise<void> {
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
            import('../../storage/contacts/keys.js').then(({ computeKeyFingerprint }) => {
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
                        import('../../storage/contacts/keys.js').then(({ updateContactSignedPreKey }) => {
                            updateContactSignedPreKey(senderUpeerId, spkPub, spkSig, spkId);
                        }).catch(() => { });
                    }
                } catch { /* ignorar */ }
            }
        }
        // Update contact name with their real alias if they provided one (Bug FA fix: ≤ 100 chars)
        if (data.alias && typeof data.alias === 'string') {
            import('../../storage/db.js').then(({ updateContactName }) => {
                updateContactName?.(senderUpeerId, (data.alias as string).slice(0, 100));
            }).catch(() => { });
        }
        // Update contact avatar if provided (Bug FA fix: ≤ 2 MB)
        if (data.avatar && typeof data.avatar === 'string' && data.avatar.startsWith('data:image/') && data.avatar.length <= 2_000_000) {
            import('../../storage/db.js').then(({ updateContactAvatar }) => {
                updateContactAvatar?.(senderUpeerId, data.avatar);
            }).catch(() => { });
        }

        // Fix 3 — Flush pending outbox: si habíamos intentado escribirle antes de
        // tener su clave pública, ahora la tenemos → cifrar + vaultear esos mensajes.
        if (data.publicKey) {
            import('../../storage/pending-outbox.js').then(({ flushPendingOutbox }) => {
                flushPendingOutbox(senderUpeerId, data.publicKey).catch(() => { });
            }).catch(() => { });
        }

        win?.webContents.send('contact-handshake-finished', { upeerId: senderUpeerId });
    }
}