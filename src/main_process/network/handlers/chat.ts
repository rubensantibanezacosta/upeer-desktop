import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import {
    getContactByUpeerId,
    updateContactEphemeralPublicKey,
    saveMessage,
    updateMessageStatus,
    updateMessageContent,
    deleteMessageLocally,
    saveReaction,
    deleteReaction,
} from '../../storage/db.js';
import {
    decrypt,
} from '../../security/identity.js';

import { issueVouch, VouchType } from '../../security/reputation/vouches.js';
import { network, security, warn, error } from '../../security/secure-logger.js';


// Patrón UUID reutilizado en varios handlers para validar msgId/fileId de red.
const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    const msgId = (data.id && _UUID_RE.test(String(data.id))) ? data.id : randomUUID();

    // Bug FI fix: validar ephemeralPublicKey como hex de 64 chars antes de persistir.
    if (data.ephemeralPublicKey && typeof data.ephemeralPublicKey === 'string' && /^[0-9a-f]{64}$/i.test(data.ephemeralPublicKey)) {
        updateContactEphemeralPublicKey(upeerId, data.ephemeralPublicKey);
    }

    let displayContent = data.content;
    if (data.ratchetHeader) {
        // ── Double Ratchet decrypt ───────────────────────────────────────────
        try {
            const { getRatchetSession, saveRatchetSession } = await import('../../storage/ratchet/index.js');
            const { x3dhResponder, ratchetInitBob, ratchetDecrypt } = await import('../../security/ratchet.js');
            const { getMyIdentitySkBuffer, getSpkBySpkId } = await import('../../security/identity.js');

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

/**
 * BUG CB fix: handler que nunca existió para CHAT_CONTACT.
 * El mensaje era enviado por sendContactCard() pero rechazado antes de llegar
 * al switch (validateMessage retornaba 'Unknown message type: CHAT_CONTACT').
 * Ahora validateMessage lo acepta y este handler lo procesa.
 */
export function handleChatContact(
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

export async function handleIncomingReaction(upeerId: string, data: any, win: BrowserWindow | null) {
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

export async function handleIncomingUpdate(upeerId: string, contact: any, data: any, win: BrowserWindow | null, signature: any) {
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
    const { getMessageById } = await import('../../storage/db.js');
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

export async function handleIncomingDelete(upeerId: string, data: any, win: BrowserWindow | null) {
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
        const { verify } = await import('../../security/identity.js');
        const { canonicalStringify } = await import('../utils.js');
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
    const { getMessageById } = await import('../../storage/db.js');
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

    network('Message deleted via P2P command', undefined, { msgId, requester: upeerId }, 'network');
}