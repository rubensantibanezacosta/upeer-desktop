import crypto from 'node:crypto';
import {
    getMyPublicKeyHex,
    getMyUPeerId,
    sign,
    encrypt,
    getMyEphemeralPublicKeyHex,
    incrementEphemeralMessageCounter,
    getMyIdentitySkBuffer,
} from '../../security/identity.js';
import {
    getContactByUpeerId,
    getContacts,
} from '../../storage/contacts/operations.js';
import {
    getGroupById
} from '../../storage/groups/operations.js';
import {
    saveMessage,
    updateMessageStatus,
    updateMessageContent,
    deleteMessageLocally,
    getMessageById,
} from '../../storage/messages/operations.js';
import {
    saveReaction,
    deleteReaction,
} from '../../storage/messages/reactions.js';
import { warn, error } from '../../security/secure-logger.js';
import { buildMessagePayload } from '../messagePayload.js';
import { canonicalStringify } from '../utils.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { startDhtSearch } from '../dht/core.js';
import { EPH_FRESHNESS_MS, MAX_MESSAGE_SIZE_BYTES } from '../server/constants.js';

const CHAT_ACK_TIMEOUT_MS = 2500;

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

/**
 * Helper to get all verified addresses for a contact (primary + known)
 */
function getFanOutAddresses(contact: any): string[] {
    const addresses = new Set<string>();
    if (contact.address) addresses.add(contact.address);
    if (contact.knownAddresses) {
        try {
            const known = typeof contact.knownAddresses === 'string'
                ? JSON.parse(contact.knownAddresses)
                : contact.knownAddresses;
            if (Array.isArray(known)) {
                known.forEach((a: string) => addresses.add(a));
            }
        } catch { /* ignore */ }
    }
    return Array.from(addresses);
}

async function vaultChatForOfflineDelivery(
    recipientUpeerId: string,
    recipientPublicKey: string,
    msgId: string,
    content: string,
    replyTo: string | undefined,
    senderUpeerId: string,
    timestamp: number,
): Promise<number> {
    const senderEphemeralPublicKey = getMyEphemeralPublicKeyHex();
    const vaultEncrypted = encrypt(
        Buffer.from(content, 'utf-8'),
        Buffer.from(recipientPublicKey, 'hex')
    );

    const vaultData = {
        type: 'CHAT',
        id: msgId,
        content: vaultEncrypted.ciphertext,
        nonce: vaultEncrypted.nonce,
        timestamp,
        ephemeralPublicKey: senderEphemeralPublicKey,
        useRecipientEphemeral: false,
        replyTo,
    };

    const vaultSig = sign(Buffer.from(canonicalStringify(vaultData)));
    const innerPacket = {
        ...vaultData,
        senderUpeerId,
        signature: vaultSig.toString('hex')
    };

    const { VaultManager } = await import('../vault/manager.js');
    return VaultManager.replicateToVaults(recipientUpeerId, innerPacket);
}

export async function sendUDPMessage(upeerId: string, message: string | { [key: string]: any }, replyTo?: string): Promise<{ id: string; savedMessage: string; timestamp: number } | undefined> {
    const selfId = getMyUPeerId();
    const msgId = crypto.randomUUID();
    const content = typeof message === 'string' ? message : (message as any).content;
    const providedLinkPreview = typeof message === 'string' ? null : (message as any).linkPreview ?? null;

    // Límite de tamaño para prevenir OOM y JSON bombs
    if (content.length > MAX_MESSAGE_SIZE_BYTES) {
        error(`Message size exceeds limit (${content.length} > ${MAX_MESSAGE_SIZE_BYTES})`, { upeerId, msgId }, 'security');
        return undefined;
    }

    const URL_FIRST_RE = /(https?:\/\/[^\s<>"']+)/i;
    const urlMatch = URL_FIRST_RE.exec(content);
    let payload = content;
    if (providedLinkPreview) {
        payload = await buildMessagePayload(content, providedLinkPreview);
    } else if (urlMatch) {
        const { fetchOgPreview } = await import('../og-fetcher.js');
        const preview = await fetchOgPreview(urlMatch[1]);
        if (preview) {
            payload = await buildMessagePayload(content, preview);
        }
    }

    if (payload.length > MAX_MESSAGE_SIZE_BYTES) {
        error(`Message payload size exceeds limit (${payload.length} > ${MAX_MESSAGE_SIZE_BYTES})`, { upeerId, msgId }, 'security');
        return undefined;
    }

    const contact = await getContactByUpeerId(upeerId);
    if (!contact || !contact.publicKey) {
        if (contact && !contact.publicKey) {
            await saveMessage(msgId, upeerId, true, content, replyTo, '', 'sent');
            const { savePendingOutboxMessage } = await import('../../storage/pending-outbox.js');
            await savePendingOutboxMessage(upeerId, msgId, content, replyTo);
            warn('No pubkey for contact, message queued in pending outbox', { upeerId }, 'vault');
            return { id: msgId, savedMessage: content };
        }
        return undefined;
    }

    if (contact.status !== 'connected') {
        const timestamp = Date.now();
        await saveMessage(msgId, upeerId, true, payload, replyTo, '', 'sent', selfId, timestamp);

        try {
            const nodes = await vaultChatForOfflineDelivery(
                upeerId,
                contact.publicKey,
                msgId,
                payload,
                replyTo,
                selfId,
                timestamp
            );

            if (nodes > 0 && await updateMessageStatus(msgId, 'vaulted' as any)) {
                const { BrowserWindow } = await import('electron');
                setTimeout(() => {
                    BrowserWindow.getAllWindows()[0]?.webContents.send('message-status-updated', { id: msgId, status: 'vaulted' });
                }, 0);
            }
        } catch (err) {
            error('Immediate vault replication failed for offline contact', err, 'vault');
        }

        startDhtSearch(upeerId, sendSecureUDPMessage);
        return { id: msgId, savedMessage: payload, timestamp };
    }

    // ── Cifrado: Double Ratchet (preferido) o crypto_box (fallback) ──────────
    let ratchetHeader: Record<string, unknown> | undefined;
    let x3dhInit: Record<string, unknown> | undefined;
    let contentHex: string;
    let nonceHex: string;
    let ephPubKey: string | undefined;
    let useEphemeralFlag: boolean | undefined;

    try {
        const { getRatchetSession, saveRatchetSession } = await import('../../storage/ratchet/operations.js');
        const { x3dhInitiator, ratchetInitAlice, ratchetEncrypt } = await import('../../security/ratchet.js');

        const sessionResult = getRatchetSession(upeerId);
        let session = sessionResult?.state;
        let usedSpkId = sessionResult?.spkIdUsed;

        if (!session && contact.signedPreKey) {
            // No hay sesión pero el contacto tiene SPK → X3DH + iniciar como Alice
            const myIkSk = getMyIdentitySkBuffer();
            const myIkPk = Buffer.from(getMyPublicKeyHex(), 'hex');
            const bobIkPk = Buffer.from(contact.publicKey, 'hex');
            const bobSpkPk = Buffer.from(contact.signedPreKey as string, 'hex');

            const { sharedSecret, ekPub } = x3dhInitiator(myIkSk, myIkPk, bobIkPk, bobSpkPk);
            session = ratchetInitAlice(sharedSecret, bobSpkPk);
            sharedSecret.fill(0);

            usedSpkId = contact.signedPreKeyId;
            x3dhInit = {
                ekPub: ekPub.toString('hex'),
                spkId: usedSpkId,
                ikPub: myIkPk.toString('hex'),
            };
        }

        if (session) {
            const { header, ciphertext, nonce } = ratchetEncrypt(session, Buffer.from(payload, 'utf-8'));
            saveRatchetSession(upeerId, session, usedSpkId);
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
            Buffer.from(payload, 'utf-8'),
            Buffer.from(targetKeyHex, 'hex')
        );
        if (useEphemeral) incrementEphemeralMessageCounter();
        useEphemeralFlag = useEphemeral;
        contentHex = ciphertext;
        nonceHex = nonce;
    }

    const timestamp = Date.now();
    const data = {
        type: 'CHAT',
        id: msgId,
        content: contentHex,
        nonce: nonceHex,
        timestamp,
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
    const isToSelf = upeerId === selfId;
    await saveMessage(msgId, upeerId, true, payload, replyTo, signature.toString('hex'), isToSelf ? 'read' : 'sent', selfId, timestamp);

    // Multi-device sync: Identificar otras IPs propias para auto-envío
    const selfAddresses: string[] = [];
    const myYggAddress = (await import('../../sidecars/yggstack.js')).getYggstackAddress();

    try {
        const { getKademliaInstance } = await import('../dht/handlers.js');
        const kademlia = getKademliaInstance();
        if (kademlia) {
            // Buscamos nodos que tengan nuestro mismo uPeerId pero diferente IP (nuestras otras instancias)
            const selfNodes = kademlia.findClosestContacts(selfId, 20)
                .filter(n => n.upeerId === selfId && n.address !== myYggAddress);

            for (const node of selfNodes) {
                if (!selfAddresses.includes(node.address)) selfAddresses.push(node.address);
            }
        }
    } catch (err) {
        error('Multi-device: failed to find own addresses via DHT', err, 'network');
    }

    // Multi-device: send to every known address (same mnemonic → same ID, different Yggdrasil IPs).
    // Se pasa contact.publicKey para activar Sealed Sender en todos los envíos de CHAT.
    const chatAddresses: string[] = [];
    if (contact.address) chatAddresses.push(contact.address);

    // Añadir direcciones propias al fan-out para sincronización en tiempo real
    for (const addr of selfAddresses) {
        if (!chatAddresses.includes(addr)) chatAddresses.push(addr);
    }

    try {
        const known: string[] = JSON.parse((contact as any).knownAddresses ?? '[]');
        for (const addr of known) {
            if (!chatAddresses.includes(addr)) chatAddresses.push(addr);
        }
    } catch { /* malformed JSON – ignore */ }

    // Enviar a todas las instancias (propias y del contacto)
    const myPublicKey = (await import('../../security/identity.js')).getMyPublicKey().toString('hex');
    for (const addr of chatAddresses) {
        // Si es una dirección propia, usamos nuestra propia public key para el Sealed Sender
        // Si es una dirección del contacto, usamos la suya.
        const isSelf = selfAddresses.includes(addr);
        const targetSealedKey = isSelf ? myPublicKey : contact.publicKey;
        // isInternalSync a true si enviamos a una de nuestras propias IPs
        sendSecureUDPMessage(addr, data, targetSealedKey, isSelf);
    }

    // Vault Sync: si tenemos otros dispositivos offline, vaultear para nosotros mismos
    // BUG DM fix: solo vaultear si el envío real no pudo realizarse a ninguna otra instancia propia.
    // Esto evita la doble replicación innecesaria en el arranque.
    if (selfAddresses.length < 2) {
        import('../vault/manager.js').then(async ({ VaultManager }) => {
            try {
                // Re-encapsular para el vault con firma propia.
                // Usamos cifrado ESTÁTICO con nuestra propia clave para asegurar que
                // cualquier instancia con el mnemónico pueda descifrarlo sin depender de DR.
                const { encrypt: encStatic } = await import('../../security/identity.js');
                const selfVaultEncrypted = encStatic(
                    Buffer.from(payload, 'utf-8'),
                    Buffer.from(myPublicKey, 'hex')
                );

                const syncPacket = {
                    type: 'CHAT',
                    id: msgId,
                    content: selfVaultEncrypted.ciphertext,
                    nonce: selfVaultEncrypted.nonce,
                    timestamp,
                    ephemeralPublicKey: getMyEphemeralPublicKeyHex(),
                    useRecipientEphemeral: false,
                    replyTo,
                    senderUpeerId: selfId
                };

                const syncSig = sign(Buffer.from(canonicalStringify(syncPacket)));
                const signedSyncPacket = {
                    ...syncPacket,
                    signature: syncSig.toString('hex')
                };

                // Guardar en el vault asociado a nuestro propio ID
                await VaultManager.replicateToVaults(selfId, signedSyncPacket);
            } catch (err) {
                error('Multi-device: failed to vault sync packet', err, 'vault');
            }
        }).catch(err => error('Multi-device: failed to load VaultManager for sync', err, 'vault'));
    }

    // BUG FM fix: el callback async de setTimeout carecía de try/catch.
    // Cualquier excepción interna (crypto, import dinámico, DB) se convertía en
    // una unhandled promise rejection silenciosa que no reintentaba el vault.
    setTimeout(async () => {
        try {
            const { getMessageStatus } = await import('../../storage/messages/status.js');
            const status = getMessageStatus(msgId);
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

                const nodes = await vaultChatForOfflineDelivery(
                    upeerId,
                    freshContact.publicKey,
                    msgId,
                    payload,
                    replyTo,
                    selfId,
                    timestamp
                );

                if (nodes > 0) {
                    const { updateMessageStatus } = await import('../../storage/messages/operations.js');
                    if (await updateMessageStatus(msgId, 'vaulted' as any)) {
                        const { BrowserWindow } = await import('electron');
                        BrowserWindow.getAllWindows()[0]?.webContents.send('message-status-updated', { id: msgId, status: 'vaulted' });
                    }
                }

                // Also start a DHT search in case the peer moved
                startDhtSearch(upeerId, sendSecureUDPMessage);
            }
        } catch (err) {
            error('Vault fallback setTimeout failed', err, 'vault');
        }
    }, CHAT_ACK_TIMEOUT_MS);

    return { id: msgId, savedMessage: payload, timestamp };
}

export async function sendTypingIndicator(upeerId: string) {
    if (upeerId.startsWith('grp-')) {
        const group = getGroupById(upeerId);
        if (!group || group.status !== 'active') return;

        // Fan-out to all group members
        const myId = getMyUPeerId();
        const data = { type: 'TYPING', groupId: upeerId }; // Include groupId

        for (const memberId of group.members) {
            if (memberId === myId) continue;
            const contact = await getContactByUpeerId(memberId);
            if (contact?.status === 'connected') {
                const addresses = getFanOutAddresses(contact);
                for (const addr of addresses) {
                    sendSecureUDPMessage(addr, data, contact.publicKey);
                }
            }
        }
        return;
    }

    const contact = await getContactByUpeerId(upeerId);
    if (!contact || contact.status !== 'connected') return;
    const addresses = getFanOutAddresses(contact);
    for (const addr of addresses) {
        sendSecureUDPMessage(addr, { type: 'TYPING' }, contact.publicKey);
    }
}

export async function sendReadReceipt(upeerId: string, id: string) {
    const myId = getMyUPeerId();
    if (await updateMessageStatus(id, 'read')) {
        const { BrowserWindow } = await import('electron');
        BrowserWindow.getAllWindows()[0]?.webContents.send('message-status-updated', { id, status: 'read' });
    }

    const { getMessageById } = await import('../../storage/messages/operations.js');
    const msg = await getMessageById(id);
    if (!msg) return;

    // Si es un grupo, el upeerId del contacto al que mandamos el recibo es el senderUpeerId del mensaje
    const targetId = upeerId.startsWith('grp-') ? msg.senderUpeerId : upeerId;
    if (!targetId || targetId === myId) return;

    const contact = await getContactByUpeerId(targetId);
    if (!contact) return;

    const data = {
        type: 'READ',
        id,
        senderUpeerId: myId,
        ...(upeerId.startsWith('grp-') ? { chatUpeerId: upeerId } : {})
    };
    const signature = sign(Buffer.from(canonicalStringify(data)));
    const signedData = { ...data, signature: signature.toString('hex') };

    // Multi-device sync for myId... (omitted but already present in logic)
    const selfAddresses = await getSelfAddresses(myId);

    // Almacenar y propagar
    const addresses = getFanOutAddresses(contact);
    for (const addr of addresses) {
        sendSecureUDPMessage(addr, signedData, contact.publicKey);
    }

    const myPublicKey = (await import('../../security/identity.js')).getMyPublicKey().toString('hex');
    for (const addr of selfAddresses) {
        sendSecureUDPMessage(addr, signedData, myPublicKey, true);
    }

    import('../vault/manager.js').then(({ VaultManager }) => {
        VaultManager.replicateToVaults(targetId, signedData);
        if (selfAddresses.length < 1) VaultManager.replicateToVaults(myId, signedData);
    }).catch(err => error('Failed to vault READ receipt', err, 'vault'));
}

export async function sendContactCard(targetUpeerId: string, contact: any) {
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
    await saveMessage(msgId, targetUpeerId, true, `CONTACT_CARD|${contact.name}`, undefined, signature.toString('hex'));

    const addresses = getFanOutAddresses(targetContact);
    for (const addr of addresses) {
        sendSecureUDPMessage(addr, data, targetContact.publicKey);
    }
    return msgId;
}

export async function sendChatReaction(upeerId: string, msgId: string, emoji: string, remove: boolean) {
    const isGroup = upeerId.startsWith('grp-');
    const myId = getMyUPeerId();

    if (remove) deleteReaction(msgId, myId, emoji);
    else saveReaction(msgId, myId, emoji);

    const data = {
        type: 'CHAT_REACTION',
        msgId,
        emoji,
        remove,
        senderUpeerId: myId,
        ...(isGroup ? { chatUpeerId: upeerId } : {}) // Contexto de grupo para receptores
    };
    const signature = sign(Buffer.from(canonicalStringify(data)));
    const signedData = { ...data, signature: signature.toString('hex') };

    const myPublicKey = (await import('../../security/identity.js')).getMyPublicKey().toString('hex');

    if (isGroup) {
        const group = getGroupById(upeerId);
        if (!group || group.status !== 'active') return;

        // Fan-out para miembros del grupo
        for (const memberId of group.members) {
            if (memberId === myId) continue;
            const contact = await getContactByUpeerId(memberId);
            if (contact?.status === 'connected') {
                const addresses = getFanOutAddresses(contact);
                for (const addr of addresses) {
                    sendSecureUDPMessage(addr, signedData, contact.publicKey);
                }
            } else if (contact?.publicKey) {
                // Vault para miembros offline
                import('../vault/manager.js').then(({ VaultManager }) => {
                    VaultManager.replicateToVaults(memberId, signedData);
                });
            }
        }
        // Auto-sincronizar con mis otros dispositivos
        const selfAddresses: string[] = await getSelfAddresses(myId);
        for (const addr of selfAddresses) {
            sendSecureUDPMessage(addr, signedData, myPublicKey, true);
        }
        if (selfAddresses.length < 1) {
            import('../vault/manager.js').then(({ VaultManager }) => {
                VaultManager.replicateToVaults(myId, signedData);
            });
        }
    } else {
        const contact = await getContactByUpeerId(upeerId);
        if (!contact) return;

        const addresses = getFanOutAddresses(contact);
        for (const addr of addresses) {
            sendSecureUDPMessage(addr, signedData, contact.publicKey);
        }

        const selfAddresses: string[] = await getSelfAddresses(myId);
        for (const addr of selfAddresses) {
            sendSecureUDPMessage(addr, signedData, myPublicKey, true);
        }

        import('../vault/manager.js').then(({ VaultManager }) => {
            VaultManager.replicateToVaults(upeerId, signedData);
            if (selfAddresses.length < 1) {
                VaultManager.replicateToVaults(myId, signedData);
            }
        });
    }
}

async function getSelfAddresses(myId: string): Promise<string[]> {
    const selfAddresses: string[] = [];
    try {
        const { getKademliaInstance } = await import('../dht/handlers.js');
        const kademlia = getKademliaInstance();
        const myYggAddress = (await import('../../sidecars/yggstack.js')).getYggstackAddress();
        if (kademlia) {
            const selfNodes = kademlia.findClosestContacts(myId, 20)
                .filter(n => n.upeerId === myId && n.address !== myYggAddress);
            for (const node of selfNodes) selfAddresses.push(node.address);
        }
    } catch { /* silent */ }
    return selfAddresses;
}

export async function sendChatUpdate(upeerId: string, msgId: string, newContent: string, linkPreview?: { [key: string]: any } | null) {
    // Límite de tamaño para prevenir OOM y JSON bombs
    if (newContent.length > MAX_MESSAGE_SIZE_BYTES) {
        error(`Chat update size exceeds limit (${newContent.length} > ${MAX_MESSAGE_SIZE_BYTES})`, { upeerId, msgId }, 'security');
        return;
    }

    const { getMessageById } = await import('../../storage/messages/operations.js');
    const existing = await getMessageById(msgId);
    const newVersion = (existing?.version ?? 0) + 1;
    const myId = getMyUPeerId();
    const isGroup = upeerId.startsWith('grp-');
    const URL_FIRST_RE = /(https?:\/\/[^\s<>"']+)/i;
    const urlMatch = URL_FIRST_RE.exec(newContent);
    let payload = newContent;

    if (linkPreview) {
        payload = await buildMessagePayload(newContent, linkPreview);
    } else if (urlMatch) {
        const { fetchOgPreview } = await import('../og-fetcher.js');
        const preview = await fetchOgPreview(urlMatch[1]);
        if (preview) {
            payload = await buildMessagePayload(newContent, preview);
        }
    }

    // Persistir localmente
    const signature = sign(Buffer.from(payload));
    updateMessageContent(msgId, payload, signature.toString('hex'), newVersion);

    const broadcastUpdate = async (targetId: string, isGroupContext: boolean) => {
        const contact = await getContactByUpeerId(targetId);
        if (!contact || !contact.publicKey) return;

        const useEphemeral = typeof contact.ephemeralPublicKey === 'string' && /^[0-9a-f]{64}$/i.test(contact.ephemeralPublicKey);
        const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;
        if (!targetKeyHex) return;

        const ephPubKey = getMyEphemeralPublicKeyHex();
        const { ciphertext, nonce } = encrypt(
            Buffer.from(payload, 'utf-8'),
            Buffer.from(targetKeyHex, 'hex')
        );

        if (useEphemeral) incrementEphemeralMessageCounter();

        const data = {
            type: 'CHAT_UPDATE',
            msgId,
            content: ciphertext,
            nonce: nonce,
            version: newVersion,
            ephemeralPublicKey: ephPubKey,
            useRecipientEphemeral: useEphemeral,
            ...(isGroupContext ? { chatUpeerId: upeerId } : {})
        };

        const sig = sign(Buffer.from(canonicalStringify(data)));
        const signedData = { ...data, signature: sig.toString('hex'), senderUpeerId: myId };

        if (contact.status === 'connected') {
            const addresses = getFanOutAddresses(contact);
            for (const addr of addresses) {
                sendSecureUDPMessage(addr, signedData, contact.publicKey);
            }
        }

        // Vault para el destinatario
        import('../vault/manager.js').then(({ VaultManager }) => {
            VaultManager.replicateToVaults(targetId, signedData);
        });
    };

    if (isGroup) {
        const group = getGroupById(upeerId);
        if (!group) return;

        for (const memberId of group.members) {
            if (memberId === myId) continue;
            broadcastUpdate(memberId, true);
        }
    } else {
        broadcastUpdate(upeerId, false);
    }

    // Auto-sincronización con mis otros dispositivos
    // Para el sync interno, usamos una versión simplificada (o la misma pero firmada con nuestra clave)
    const selfSyncPacket = {
        type: 'CHAT_UPDATE',
        msgId,
        content: payload,
        version: newVersion,
        chatUpeerId: upeerId,
        senderUpeerId: myId
    };
    const selfSyncSig = sign(Buffer.from(canonicalStringify(selfSyncPacket)));
    const signedSelfSync = { ...selfSyncPacket, signature: selfSyncSig.toString('hex') };

    const selfAddresses = await getSelfAddresses(myId);
    const myPublicKey = (await import('../../security/identity.js')).getMyPublicKey().toString('hex');
    for (const addr of selfAddresses) {
        sendSecureUDPMessage(addr, signedSelfSync, myPublicKey, true);
    }

    import('../vault/manager.js').then(({ VaultManager }) => {
        VaultManager.replicateToVaults(myId, signedSelfSync);
    });
}

export async function sendChatDelete(upeerId: string, msgId: string) {
    const myId = getMyUPeerId();
    const isGroup = upeerId.startsWith('grp-');

    const msg = await getMessageById(msgId) as any;
    const { extractLocalAttachmentInfo, cleanupLocalAttachmentFile } = await import('../../utils/localAttachmentCleanup.js');
    const attachment = msg?.message ? extractLocalAttachmentInfo(msg.message) : null;

    if (attachment?.fileId) {
        const { fileTransferManager } = await import('../file-transfer/transfer-manager.js');
        fileTransferManager.cancelTransfer(attachment.fileId, 'message deleted');
    }

    await cleanupLocalAttachmentFile(attachment?.filePath);

    // 1. Borrado local inmediato
    deleteMessageLocally(msgId);

    const data = {
        type: 'CHAT_DELETE',
        msgId,
        timestamp: Date.now(),
        ...(isGroup ? { chatUpeerId: upeerId } : {})
    };

    const signature = sign(Buffer.from(canonicalStringify(data)));
    const signedData = { ...data, signature: signature.toString('hex'), senderUpeerId: myId };
    const myPublicKey = (await import('../../security/identity.js')).getMyPublicKey().toString('hex');

    const broadcastDelete = async (targetId: string) => {
        const contact = await getContactByUpeerId(targetId);
        if (contact && contact.status === 'connected') {
            const addresses = getFanOutAddresses(contact);
            for (const addr of addresses) {
                sendSecureUDPMessage(addr, signedData, contact.publicKey);
            }
        }
        // Vault para el destinatario
        import('../vault/manager.js').then(({ VaultManager }) => {
            VaultManager.replicateToVaults(targetId, signedData);
        });
    };

    if (isGroup) {
        const group = getGroupById(upeerId);
        if (group) {
            for (const memberId of group.members) {
                if (memberId === myId) continue;
                broadcastDelete(memberId);
            }
        }
    } else {
        broadcastDelete(upeerId);
    }

    // Auto-Sync con mis otros dispositivos
    const selfAddresses = await getSelfAddresses(myId);
    for (const addr of selfAddresses) {
        sendSecureUDPMessage(addr, signedData, myPublicKey, true);
    }
    import('../vault/manager.js').then(({ VaultManager }) => {
        VaultManager.replicateToVaults(myId, signedData);
    });

    // Propagación resiliente en amigos (Anti-Zombi)
    const allContacts = await getContacts();
    const trustedFriends = (allContacts as any[]).filter((c: any) => c.status === 'connected' && c.upeerId !== myId && c.upeerId !== upeerId);
    for (const friend of trustedFriends.slice(0, 3)) {
        import('../vault/manager.js').then(({ VaultManager }) => {
            VaultManager.replicateToVaults(friend.upeerId, signedData);
        });
    }
}

/**
 * Difunde una orden de vaciado de chat (CHAT_CLEAR_ALL) para sincronización multi-dispositivo.
 */
export async function sendChatClear(upeerId: string, customTimestamp?: number) {
    const myId = getMyUPeerId();
    const myPublicKey = (await import('../../security/identity.js')).getMyPublicKey().toString('hex');
    const timestamp = customTimestamp || Date.now();

    const data = {
        type: 'CHAT_CLEAR_ALL',
        chatUpeerId: upeerId,
        timestamp
    };

    // 1. Multi-device Fan-out (P2P Directo a nosotros mismos)
    try {
        const { getKademliaInstance } = await import('../dht/handlers.js');
        const kademlia = getKademliaInstance();
        const myYggAddress = (await import('../../sidecars/yggstack.js')).getYggstackAddress();

        if (kademlia) {
            const selfNodes = kademlia.findClosestContacts(myId, 20)
                .filter(n => n.upeerId === myId && n.address !== myYggAddress);

            for (const node of selfNodes) {
                // Sincronización interna: usamos nuestra propia pubkey para Sealed Sender
                sendSecureUDPMessage(node.address, data, myPublicKey);
            }
        }
    } catch { /* silent */ }

    // 2. Vaulting de persistencia (Auto-Sincronización para dispositivos offline)
    // El "Anti-Zombi" depende de que otros dispositivos reciban este paquete
    const signature = sign(Buffer.from(canonicalStringify(data)));
    const vaultPacket = {
        ...data,
        senderUpeerId: myId,
        signature: signature.toString('hex')
    };

    // 3. Ejecutar Limpieza LOCAL inmediata
    const { deleteMessagesByChatId } = await import('../../storage/messages/operations.js');
    deleteMessagesByChatId(upeerId, timestamp);

    import('../vault/manager.js').then(({ VaultManager }) => {
        // Guardamos en nuestros propios vaults (otros dispositivos nuestros lo recogerán)
        VaultManager.replicateToVaults(myId, vaultPacket);

        // Propagación resiliente en top friends (como backups de órdenes de limpieza)
        const allContacts = getContacts();
        const trustedFriends = (allContacts as any[]).filter((c: any) => c && c.upeerId !== myId);
        for (const friend of trustedFriends.slice(0, 3)) {
            VaultManager.replicateToVaults(friend.upeerId, vaultPacket);
        }
    });
}

