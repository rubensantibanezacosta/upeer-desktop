import crypto from 'node:crypto';
import {
    getMyPublicKeyHex,
    getMyUPeerId,
    getMyAlias,
    getMyAvatar,
    sign,
    encrypt,
    getMyEphemeralPublicKeyHex,
    incrementEphemeralMessageCounter,
    getMyIdentitySkBuffer,
    getMyIdentityPkBuffer,
} from '../../security/identity.js';
import { getContactByUpeerId, saveMessage, updateMessageStatus, updateMessageContent, deleteMessageLocally, saveReaction, deleteReaction } from '../../storage/db.js';
import { warn, error } from '../../security/secure-logger.js';
import { canonicalStringify } from '../utils.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { startDhtSearch } from '../dht/core.js';
import { EPH_FRESHNESS_MS } from '../server/constants.js';

function shouldUseEphemeral(contact: any): boolean {
    if (!contact?.ephemeralPublicKey) return false;
    // Usar ephemeralPublicKeyUpdatedAt (timestamp preciso de cuándo se recibió la
    // clave efímera) en lugar de lastSeen (que se actualiza con cualquier PING/PONG
    // y por tanto siempre es reciente, haciendo la comprobación inútil).
    const updatedAt = contact.ephemeralPublicKeyUpdatedAt
        ? new Date(contact.ephemeralPublicKeyUpdatedAt).getTime()
        : 0;
    return updatedAt > 0 && (Date.now() - updatedAt) < EPH_FRESHNESS_MS;
}

export async function sendUDPMessage(upeerId: string, message: string | { [key: string]: any }, replyTo?: string): Promise<string | undefined> {
    const myId = getMyUPeerId();
    const msgId = crypto.randomUUID();
    const content = typeof message === 'string' ? message : (message as any).content;

    const contact = await getContactByUpeerId(upeerId);
    if (!contact || contact.status !== 'connected' || !contact.publicKey) {
        // Fix 3 — Resiliencia para contactos sin clave pública aún (nunca han conectado):
        // En vez de descartar el mensaje, lo guardamos cifrado por SQLCipher en la outbox local.
        // Se vaultea automáticamente cuando Bob conecte y enviemos su primer HANDSHAKE.
        if (contact && !contact.publicKey) {
            // Persistir localmente para que el usuario vea el mensaje en el historial.
            // No hay firma aún (se firmará al vaultear durante el flush del outbox).
            saveMessage(msgId, upeerId, true, content, replyTo, '', 'sent');
            const { savePendingOutboxMessage } = await import('../../storage/pending-outbox.js');
            await savePendingOutboxMessage(upeerId, msgId, content, replyTo);
            warn('No pubkey for contact, message queued in pending outbox', { upeerId }, 'vault');
            return msgId;
        }
        return undefined;
    }

    // ── Cifrado: Double Ratchet (preferido) o crypto_box (fallback) ──────────
    let ratchetHeader: Record<string, unknown> | undefined;
    let x3dhInit: Record<string, unknown> | undefined;
    let contentHex: string;
    let nonceHex: string;
    let ephPubKey: string | undefined;
    let useEphemeralFlag: boolean | undefined;

    try {
        const { getRatchetSession, saveRatchetSession } = await import('../../storage/ratchet/index.js');
        const { x3dhInitiator, ratchetInitAlice, ratchetEncrypt } = await import('../../security/ratchet.js');

        let session = getRatchetSession(upeerId);

        if (!session && contact.signedPreKey) {
            // No hay sesión pero el contacto tiene SPK → X3DH + iniciar como Alice
            const myIkSk = getMyIdentitySkBuffer();
            const myIkPk = getMyIdentityPkBuffer();
            const bobIkPk = Buffer.from(contact.publicKey, 'hex');
            const bobSpkPk = Buffer.from(contact.signedPreKey as string, 'hex');

            const { sharedSecret, ekPub } = x3dhInitiator(myIkSk, myIkPk, bobIkPk, bobSpkPk);
            session = ratchetInitAlice(sharedSecret, bobSpkPk);
            sharedSecret.fill(0);

            x3dhInit = {
                ekPub: ekPub.toString('hex'),
                spkId: contact.signedPreKeyId,
                ikPub: myIkPk.toString('hex'),
            };
            saveRatchetSession(upeerId, session, contact.signedPreKeyId as number | undefined);
        }

        if (session) {
            const { header, ciphertext, nonce } = ratchetEncrypt(session, Buffer.from(content, 'utf-8'));
            saveRatchetSession(upeerId, session);
            ratchetHeader = header as unknown as Record<string, unknown>;
            contentHex = ciphertext;
            nonceHex = nonce;
        } else {
            throw new Error('no-session'); // caer en crypto_box
        }
    } catch {
        // Fallback: cifrado legacy crypto_box (peers sin soporte DR)
        const useEphemeral = shouldUseEphemeral(contact);
        const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;
        ephPubKey = getMyEphemeralPublicKeyHex();
        const { ciphertext, nonce } = encrypt(
            Buffer.from(content, 'utf-8'),
            Buffer.from(targetKeyHex, 'hex'),
            useEphemeral
        );
        if (useEphemeral) incrementEphemeralMessageCounter();
        useEphemeralFlag = useEphemeral;
        contentHex = ciphertext.toString('hex');
        nonceHex = nonce.toString('hex');
    }

    const data = {
        type: 'CHAT',
        id: msgId,
        content: contentHex,
        nonce: nonceHex,
        // Double Ratchet (si disponible)
        ...(ratchetHeader ? { ratchetHeader } : {}),
        ...(x3dhInit ? { x3dhInit } : {}),
        // Legacy crypto_box (si DR no disponible)
        ...(ephPubKey ? { ephemeralPublicKey: ephPubKey } : {}),
        ...(useEphemeralFlag !== undefined ? { useRecipientEphemeral: useEphemeralFlag } : {}),
        replyTo: replyTo
    };

    // Contact cache removed for privacy reasons - use DHT and renewal tokens instead
    // Previously: attached top contacts for extreme resilience
    // Now: relying on DHT persistence (30 days) and renewal tokens for resilience

    const signature = sign(Buffer.from(canonicalStringify(data)));
    const isToSelf = upeerId === getMyUPeerId();
    saveMessage(msgId, upeerId, true, content, replyTo, signature.toString('hex'), isToSelf ? 'read' : 'sent');

    // Multi-device: send to every known address (same mnemonic → same ID, different Yggdrasil IPs).
    // Se pasa contact.publicKey para activar Sealed Sender en todos los envíos de CHAT.
    const chatAddresses: string[] = [];
    if (contact.address) chatAddresses.push(contact.address);
    try {
        const known: string[] = JSON.parse((contact as any).knownAddresses ?? '[]');
        for (const addr of known) {
            if (!chatAddresses.includes(addr)) chatAddresses.push(addr);
        }
    } catch { /* malformed JSON – ignore */ }
    for (const addr of chatAddresses) {
        sendSecureUDPMessage(addr, data, contact.publicKey); // ← Sealed Sender
    }

    // BUG FM fix: el callback async de setTimeout carecía de try/catch.
    // Cualquier excepción interna (crypto, import dinámico, DB) se convertía en
    // una unhandled promise rejection silenciosa que no reintentaba el vault.
    setTimeout(async () => {
        try {
            const { getMessageStatus } = await import('../../storage/db.js');
            const status = await getMessageStatus(msgId);
            if (status === 'sent') {
                warn('Message not delivered, starting vault replication', { msgId, upeerId }, 'vault');

                // ── Vault copy: re-cifrar con crypto_box estático ─────────────────
                // El paquete `data` puede contener ratchetHeader (DR). El vault NO debe
                // almacenar el paquete DR porque:
                //   a) El estado DR del receptor puede desincronizarse (reset de app, migración).
                //   b) El vault custodio no necesita conocer el esquema de cifrado interno.
                // En su lugar, re-ciframos con la clave estática del contacto (siempre disponible).
                // Si el receptor no ha rotado su clave de identidad (TOFU), esto es siempre descifrable.
                const freshContact = await getContactByUpeerId(upeerId);
                if (!freshContact?.publicKey) return;

                const { encrypt: encStatic } = await import('../../security/identity.js');
                const vaultEncrypted = encStatic(
                    Buffer.from(content, 'utf-8'),
                    Buffer.from(freshContact.publicKey, 'hex'),
                    false  // static key, no ephemeral — vault delivery siempre usa clave estática
                );

                const vaultData = {
                    type: 'CHAT',
                    id: msgId,
                    content: vaultEncrypted.ciphertext.toString('hex'),
                    nonce: vaultEncrypted.nonce.toString('hex'),
                    // No ratchetHeader: el receptor descifra con crypto_box al recibir del vault
                    replyTo: replyTo
                };

                // Prepare a fully signed packet for the vault (inner packet).
                // IMPORTANTE: la firma debe ser sobre vaultData (cifrado estático),
                // NO sobre `data` que contiene el ciphertext DR/ephemeral diferente.
                // La verificación en handleVaultDelivery hace:
                //   verify(canonicalStringify(innerData), innerSig)  donde innerData == vaultData
                const vaultSig = sign(Buffer.from(canonicalStringify(vaultData)));
                const innerPacket = {
                    ...vaultData,
                    senderUpeerId: myId,
                    signature: vaultSig.toString('hex')
                };

                // Try to backup the message in friends' vaults
                const { VaultManager } = await import('../vault/manager.js');
                const nodes = await VaultManager.replicateToVaults(upeerId, innerPacket);

                if (nodes > 0) {
                    const { updateMessageStatus } = await import('../../storage/db.js');
                    updateMessageStatus(msgId, 'vaulted' as any);
                    const { BrowserWindow } = await import('electron');
                    BrowserWindow.getAllWindows()[0]?.webContents.send('message-status-updated', { id: msgId, status: 'vaulted' });
                }

                // Also start a DHT search in case the peer moved
                startDhtSearch(upeerId, sendSecureUDPMessage);
            }
        } catch (err) {
            error('Vault fallback setTimeout failed', err, 'vault');
        }
    }, 5000);

    return msgId;
}

export function sendTypingIndicator(upeerId: string) {
    const contact = getContactByUpeerId(upeerId);
    if (contact && contact.status === 'connected') sendSecureUDPMessage(contact.address, { type: 'TYPING' });
}

export function sendReadReceipt(upeerId: string, id: string) {
    updateMessageStatus(id, 'read');
    const contact = getContactByUpeerId(upeerId);
    if (contact && contact.status === 'connected') sendSecureUDPMessage(contact.address, { type: 'READ', id });
}

export function sendContactCard(targetUpeerId: string, contact: any) {
    const targetContact = getContactByUpeerId(targetUpeerId);
    if (!targetContact || targetContact.status !== 'connected') return undefined;

    const msgId = crypto.randomUUID();
    const data = {
        type: 'CHAT_CONTACT',
        id: msgId,
        contactName: contact.name,
        contactAddress: contact.address,
        upeerId: contact.upeerId,
        contactPublicKey: contact.publicKey
    };

    const signature = sign(Buffer.from(canonicalStringify(data)));
    saveMessage(msgId, targetUpeerId, true, `CONTACT_CARD|${contact.name}`, undefined, signature.toString('hex'));

    sendSecureUDPMessage(targetContact.address, data);
    return msgId;
}

export async function sendChatReaction(upeerId: string, msgId: string, emoji: string, remove: boolean) {
    const contact = await getContactByUpeerId(upeerId);
    if (!contact || contact.status !== 'connected') return;

    if (remove) deleteReaction(msgId, getMyUPeerId(), emoji);
    else saveReaction(msgId, getMyUPeerId(), emoji);

    const data = { type: 'CHAT_REACTION', msgId, emoji, remove };
    sendSecureUDPMessage(contact.address, data);
}

export async function sendChatUpdate(upeerId: string, msgId: string, newContent: string) {
    const contact = await getContactByUpeerId(upeerId);
    if (!contact || contact.status !== 'connected' || !contact.publicKey) return;

    const useEphemeral = shouldUseEphemeral(contact);
    const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;

    const ephPubKey = getMyEphemeralPublicKeyHex(); // capture before possible rotation
    const { ciphertext, nonce } = encrypt(
        Buffer.from(newContent, 'utf-8'),
        Buffer.from(targetKeyHex, 'hex'),
        useEphemeral
    );

    if (useEphemeral) {
        incrementEphemeralMessageCounter();
    }

    const data = {
        type: 'CHAT_UPDATE',
        msgId,
        content: ciphertext.toString('hex'),
        nonce: nonce.toString('hex'),
        ephemeralPublicKey: ephPubKey,
        useRecipientEphemeral: useEphemeral
    };

    const signature = sign(Buffer.from(canonicalStringify(data)));
    updateMessageContent(msgId, newContent, signature.toString('hex'));
    sendSecureUDPMessage(contact.address, data);
}

export async function sendChatDelete(upeerId: string, msgId: string) {
    const contact = await getContactByUpeerId(upeerId);
    if (!contact || contact.status !== 'connected') return;

    deleteMessageLocally(msgId);

    const data = {
        type: 'CHAT_DELETE',
        msgId,
        timestamp: Date.now()
    };

    // BUG BZ fix: NO pre-firmar antes de sendSecureUDPMessage.
    // sendSecureUDPMessage firma el paquete incluyendo el campo `signature` si ya existe,
    // pero el receptor extrae ese campo del nivel externo, dejando `data` sin firma.
    // handleIncomingDelete busca `signature` en `data` → undefined → descarta el mensaje.
    // La firma del paquete externo es suficiente para autenticación de entrega directa.
    // 1. Entrega directa (la firma exterior de sendSecureUDPMessage lo autentica)
    sendSecureUDPMessage(contact.address, data);

    // 2. Vault path: paquete interior separado con firma + senderUpeerId
    //    (el custodio no firma; la integridad extremo-a-extremo requiere firma propia).
    const myId = getMyUPeerId();
    const innerSignature = sign(Buffer.from(canonicalStringify(data)));
    const innerPacket = {
        ...data,
        senderUpeerId: myId,
        signature: innerSignature.toString('hex')
    };
    import('../vault/manager.js').then(({ VaultManager }) => {
        VaultManager.replicateToVaults(upeerId, innerPacket);
    }).catch(err => error('Failed to propagate delete to vaults', err, 'vault'));
}

