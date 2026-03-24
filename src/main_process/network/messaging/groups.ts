import crypto from 'node:crypto';
import {
    getMyUPeerId,
    sign,
    encrypt,
    getMyEphemeralPublicKeyHex,
    incrementEphemeralMessageCounter,
} from '../../security/identity.js';
import {
    getContactByUpeerId,
} from '../../storage/contacts/operations.js';
import {
    saveMessage,
    deleteMessagesByChatId,
} from '../../storage/messages/operations.js';
import {
    getGroupById,
    saveGroup,
    updateGroupMembers,
    updateGroupInfo,
    deleteGroup,
} from '../../storage/groups/operations.js';
import { warn, error } from '../../security/secure-logger.js';
import { buildGroupInvitePayload, buildGroupUpdatePayload } from '../groupPayload.js';
import { buildMessagePayload } from '../messagePayload.js';
import { canonicalStringify } from '../utils.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { EPH_FRESHNESS_MS, MAX_MESSAGE_SIZE_BYTES } from '../server/constants.js';

function shouldUseEphemeral(contact: any): boolean {
    if (!contact?.ephemeralPublicKey) return false;
    const updatedAt = contact.ephemeralPublicKeyUpdatedAt
        ? new Date(contact.ephemeralPublicKeyUpdatedAt).getTime()
        : 0;
    return updatedAt > 0 && (Date.now() - updatedAt) < EPH_FRESHNESS_MS;
}

/**
 * Send a text message to a group (fan-out to each member).
 * Returns the generated message ID and timestamp.
 */
export async function sendGroupMessage(
    groupId: string,
    message: string,
    replyTo?: string,
    linkPreview?: { [key: string]: any } | null
): Promise<{ id: string; timestamp: number; savedMessage: string } | undefined> {
    // Límite de tamaño para prevenir OOM y JSON bombs
    if (message.length > MAX_MESSAGE_SIZE_BYTES) {
        error(`Group message size exceeds limit (${message.length} > ${MAX_MESSAGE_SIZE_BYTES})`, { groupId }, 'security');
        return undefined;
    }

    const group = getGroupById(groupId);
    if (!group || group.status !== 'active') return undefined;

    const msgId = crypto.randomUUID();
    const myId = getMyUPeerId();
    const timestamp = Date.now();
    const URL_FIRST_RE = /(https?:\/\/[^\s<>"']+)/i;
    const urlMatch = URL_FIRST_RE.exec(message);
    let payload = message;

    if (linkPreview) {
        payload = await buildMessagePayload(message, linkPreview);
    } else if (urlMatch) {
        const { fetchOgPreview } = await import('../og-fetcher.js');
        const preview = await fetchOgPreview(urlMatch[1]);
        if (preview) {
            payload = await buildMessagePayload(message, preview);
        }
    }

    // Save locally first
    const signature = sign(Buffer.from(payload));
    await saveMessage(msgId, groupId, true, payload, replyTo, signature.toString('hex'), 'sent', myId, timestamp);

    // Fan-out: send to every member including other devices of ours for "Self-Sync"
    const membersWithSelf = [...group.members];
    // Asegurar que no duplicamos el ID pero permitimos el fan-out de IPs adicionales
    const uniqueMembers = Array.from(new Set(membersWithSelf));

    for (const memberUpeerId of uniqueMembers) {
        // En grupos, el emisor (yo) también quiere recibir una copia en sus otros dispositivos
        // if (memberUpeerId === myId) continue; // <-- Eliminado para habilitar Self-Sync

        const contact = await getContactByUpeerId(memberUpeerId);
        // Si somos nosotros mismos, el "contacto" es nuestra propia info (status connected)
        if (!contact || (memberUpeerId !== myId && contact.status !== 'connected') || !contact.publicKey) continue;

        const useEphemeral = memberUpeerId === myId ? false : shouldUseEphemeral(contact);
        const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;

        const ephPubKey = getMyEphemeralPublicKeyHex(); // capture before possible rotation
        const { ciphertext, nonce } = encrypt(
            Buffer.from(payload, 'utf-8'),
            Buffer.from(targetKeyHex, 'hex')
        );

        if (useEphemeral) incrementEphemeralMessageCounter();

        const data = {
            type: 'GROUP_MSG',
            id: msgId,
            groupId,
            groupName: group.name,
            senderUpeerId: myId,
            timestamp,
            content: ciphertext,
            nonce: nonce,
            ephemeralPublicKey: ephPubKey,
            useRecipientEphemeral: useEphemeral,
            replyTo
        };

        // Identificar direcciones IP para este UPeerId (Fan-out multicanal)
        const addresses: string[] = [];
        if (contact.address) addresses.push(contact.address);

        // Si somos nosotros, buscamos nuestras otras IPs vía DHT
        if (memberUpeerId === myId) {
            try {
                const { getKademliaInstance } = await import('../dht/handlers.js');
                const kademlia = getKademliaInstance();
                const myYggAddress = (await import('../../sidecars/yggstack.js')).getYggstackAddress();
                if (kademlia) {
                    const selfNodes = kademlia.findClosestContacts(myId, 20)
                        .filter(n => n.upeerId === myId && n.address !== myYggAddress);
                    for (const node of selfNodes) {
                        if (!addresses.includes(node.address)) addresses.push(node.address);
                    }
                }
            } catch { /* silent */ }
        }

        // Añadir todas las direcciones conocidas del contacto
        try {
            const known: string[] = JSON.parse((contact as any).knownAddresses ?? '[]');
            for (const addr of known) {
                if (!addresses.includes(addr)) addresses.push(addr);
            }
        } catch { /* ignore */ }

        // Enviar a todas las direcciones conocidas del miembro (o de nosotros mismos)
        const myPublicKey = (await import('../../security/identity.js')).getMyPublicKey().toString('hex');
        for (const addr of addresses) {
            // Si el destino es una dirección de otro dispositivo mío, mandarlo con mi propia pubkey para Sealed Sender
            const isSelf = memberUpeerId === myId;
            const targetSealedKey = isSelf ? myPublicKey : contact.publicKey;
            sendSecureUDPMessage(addr, data, targetSealedKey, isSelf);
        }
    }

    // Vault for offline members (we have their pubkey from previous handshake).
    // Incluirnos a nosotros mismos para la sincronización si no hay otros dispositivos online.
    const offlineTargetMembers = [...uniqueMembers];
    for (const memberUpeerId of offlineTargetMembers) {
        const contact = await getContactByUpeerId(memberUpeerId);
        // Skip si el contacto está conectado (ya se envió por UDP).
        // PERO si somos nosotros, siempre intentamos vaultear una copia si no hay otros "self-nodes" online.
        const isSelf = memberUpeerId === myId;

        // Determinar si debemos vaultear para este miembro
        if (!contact || !contact.publicKey) continue;

        let shouldVault = false;
        if (isSelf) {
            // Para nosotros mismos: vaultear si no detectamos otras IPs propias activas
            try {
                const { getKademliaInstance } = await import('../dht/handlers.js');
                const kademlia = getKademliaInstance();
                const myYggAddress = (await import('../../sidecars/yggstack.js')).getYggstackAddress();
                const otherSelfOnline = kademlia ? kademlia.findClosestContacts(myId, 20)
                    .some(n => n.upeerId === myId && n.address !== myYggAddress) : false;
                if (!otherSelfOnline) shouldVault = true;
            } catch { shouldVault = true; }
        } else {
            // Para otros miembros: vaultear si no están conectados
            if (contact.status !== 'connected') shouldVault = true;
        }

        if (!shouldVault) continue;

        // Offline members (y auto-sync): always use static key.
        const useEphemeral = false;
        const targetKeyHex = contact.publicKey;
        const { ciphertext, nonce } = encrypt(
            Buffer.from(payload, 'utf-8'),
            Buffer.from(targetKeyHex, 'hex')
        );
        const ephPubKey = getMyEphemeralPublicKeyHex();
        const offlinePacket = {
            type: 'GROUP_MSG',
            id: msgId,
            groupId,
            // groupName omitido por privacidad
            content: ciphertext,
            nonce: nonce,
            timestamp,
            ephemeralPublicKey: ephPubKey,
            useRecipientEphemeral: useEphemeral,
            replyTo
        };
        const signedPacket = {
            ...offlinePacket,
            senderUpeerId: myId, // Necesario para que el receptor sepa quién lo envió
            signature: sign(Buffer.from(canonicalStringify(offlinePacket))).toString('hex')
        };

        const { VaultManager } = await import('../vault/manager.js');
        // CID determinista: group:msgId:memberUpeerId
        const payloadHashOverride = crypto.createHash('sha256')
            .update(`group:${msgId}:${memberUpeerId}`)
            .digest('hex');

        // Replicar al vault del miembro (o al nuestro propio si isSelf)
        const nodes = await VaultManager.replicateToVaults(memberUpeerId, signedPacket, undefined, payloadHashOverride);

        if (!isSelf && nodes > 0) {
            const { updateMessageStatus } = await import('../../storage/messages/operations.js');
            if (await updateMessageStatus(msgId, 'vaulted' as any)) {
                const { BrowserWindow } = await import('electron');
                BrowserWindow.getAllWindows()[0]?.webContents.send('message-status-updated', { id: msgId, status: 'vaulted' });
            }
        }
    }

    return { id: msgId, timestamp, savedMessage: payload };
}

/**
 * Create a group, save it locally, and send GROUP_INVITE to each member.
 */
export async function createGroup(
    name: string,
    memberUpeerIds: string[],
    avatar?: string
): Promise<string> {
    const myId = getMyUPeerId();
    const groupId = `grp-${crypto.randomUUID()}`;
    const allMembers = Array.from(new Set([myId, ...memberUpeerIds]));

    saveGroup(groupId, name, myId, allMembers, 'active', avatar);

    // Send invitations
    for (const memberUpeerId of memberUpeerIds) {
        if (memberUpeerId === myId) continue;
        await _sendGroupInvite(groupId, name, allMembers, memberUpeerId, avatar);
    }

    return groupId;
}

/**
 * Invite an existing contact to a group.
 */
export async function inviteToGroup(
    groupId: string,
    upeerId: string
): Promise<void> {
    const group = getGroupById(groupId);
    if (!group) return;

    const newMembers = Array.from(new Set([...group.members, upeerId]));
    updateGroupMembers(groupId, newMembers);
    await _sendGroupInvite(groupId, group.name, newMembers, upeerId, group.avatar ?? undefined);
}

/**
 * Admin updates group name and/or avatar and broadcasts to all members.
 */
export async function updateGroup(
    groupId: string,
    fields: { name?: string; avatar?: string | null }
): Promise<void> {
    const group = getGroupById(groupId);
    if (!group) return;

    // Persist locally
    updateGroupInfo(groupId, fields);

    const myId = getMyUPeerId();
    const sensitivePayload = await buildGroupUpdatePayload({
        ...(fields.name !== undefined ? { groupName: fields.name } : {}),
        ...(fields.avatar !== undefined ? { avatar: fields.avatar } : {}),
    });

    // Fan-out to all members except self (online → send, offline → vault)
    for (const memberUpeerId of group.members) {
        if (memberUpeerId === myId) continue;
        const contact = await getContactByUpeerId(memberUpeerId);
        if (!contact || !contact.publicKey) continue;

        // BUG Y fix: para miembros offline de un grupo, !!contact.ephemeralPublicKey
        // siempre era true si la clave existía, sin importar si tenía semanas de
        // antigüedad. shouldUseEphemeral comprueba también ephemeralPublicKeyUpdatedAt < 2h,
        // usando la clave estática para peers offline (que es correcta para vault).
        const useEphemeral = contact.status === 'connected' ? shouldUseEphemeral(contact) : false;
        const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;
        const ephPubKey = getMyEphemeralPublicKeyHex(); // capture before possible rotation
        const { ciphertext, nonce } = encrypt(
            Buffer.from(sensitivePayload, 'utf-8'),
            Buffer.from(targetKeyHex, 'hex')
        );
        if (useEphemeral) incrementEphemeralMessageCounter();

        const packet = {
            type: 'GROUP_UPDATE',
            groupId,
            adminUpeerId: myId,
            payload: ciphertext,
            nonce: nonce,
            ephemeralPublicKey: ephPubKey,
            useRecipientEphemeral: useEphemeral,
        };

        const signedPacket = {
            ...packet,
            senderUpeerId: myId,
            signature: sign(Buffer.from(canonicalStringify(packet))).toString('hex')
        };

        if (contact.status === 'connected') {
            const addresses: string[] = [];
            if (contact.address) addresses.push(contact.address);
            try {
                const known = JSON.parse((contact as any).knownAddresses ?? '[]');
                for (const addr of known) if (!addresses.includes(addr)) addresses.push(addr);
            } catch { /* ignore */ }

            for (const addr of addresses) {
                sendSecureUDPMessage(addr, packet, contact.publicKey);
            }
        }

        const { VaultManager } = await import('../vault/manager.js');
        const payloadHashOverride = crypto.createHash('sha256')
            .update(`group-update:${groupId}:${memberUpeerId}:${signedPacket.signature}`)
            .digest('hex');
        await VaultManager.replicateToVaults(memberUpeerId, signedPacket, undefined, payloadHashOverride);
        if (contact.status !== 'connected') {
            warn('GROUP_UPDATE vaulted for offline member', { memberUpeerId, groupId }, 'vault');
        }
    }
}

async function _sendGroupInvite(
    groupId: string,
    groupName: string,
    members: string[],
    targetUpeerId: string,
    avatar?: string
): Promise<void> {
    const contact = await getContactByUpeerId(targetUpeerId);
    // We need at least a public key to encrypt the invite
    if (!contact || !contact.publicKey) return;

    const myId = getMyUPeerId();
    // GROUP_INVITE puede llegar a peers offline (vaulted) — usar clave estática
    // garantiza que puedan descifrarla sin importar cuánto tiempo hayan estado fuera.
    const useEphemeral = contact.status === 'connected' ? shouldUseEphemeral(contact) : false;
    const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;

    // Encrypt the sensitive payload (name, members list, avatar)
    const sensitivePayload = await buildGroupInvitePayload(groupName, members, avatar);
    const ephPubKey = getMyEphemeralPublicKeyHex(); // capture before possible rotation
    const { ciphertext, nonce } = encrypt(
        Buffer.from(sensitivePayload, 'utf-8'),
        Buffer.from(targetKeyHex, 'hex')
    );
    if (useEphemeral) incrementEphemeralMessageCounter();

    const packet = {
        type: 'GROUP_INVITE',
        groupId,
        adminUpeerId: myId,
        payload: ciphertext,
        nonce: nonce,
        ephemeralPublicKey: ephPubKey,
        useRecipientEphemeral: useEphemeral,
    };

    const signedPacket = {
        ...packet,
        senderUpeerId: myId,
        signature: sign(Buffer.from(canonicalStringify(packet))).toString('hex')
    };

    if (contact.status === 'connected') {
        const addresses: string[] = [];
        if (contact.address) addresses.push(contact.address);
        try {
            const known = JSON.parse((contact as any).knownAddresses ?? '[]');
            for (const addr of known) if (!addresses.includes(addr)) addresses.push(addr);
        } catch { /* ignore */ }

        for (const addr of addresses) {
            sendSecureUDPMessage(addr, packet, contact.publicKey);
        }
    }

    const { VaultManager } = await import('../vault/manager.js');
    const payloadHashOverride = crypto.createHash('sha256')
        .update(`group-invite:${groupId}:${targetUpeerId}`)
        .digest('hex');
    await VaultManager.replicateToVaults(targetUpeerId, signedPacket, undefined, payloadHashOverride);
    if (contact.status !== 'connected') {
        warn('GROUP_INVITE vaulted for offline member', { targetUpeerId, groupId }, 'vault');
    }
}

/**
 * Leave (and delete) a group locally, and notify all members via GROUP_LEAVE.
 * Deletes the group row and all its messages from the local DB.
 */
export async function leaveGroup(groupId: string): Promise<void> {
    const group = getGroupById(groupId);
    if (!group) return;

    const myId = getMyUPeerId();
    const packet = {
        type: 'GROUP_LEAVE',
        groupId,
        senderUpeerId: myId,
        timestamp: Date.now(),
    };
    // BUG BZ fix: NO pre-firmar antes de sendSecureUDPMessage.
    // Ver sendChatDelete para la explicación detallada del bug.
    // sendSecureUDPMessage firma el paquete completo; no se necesita firma interior
    // para la entrega directa a miembros online.
    // Notify all online members
    for (const memberUpeerId of group.members) {
        if (memberUpeerId === myId) continue;
        const contact = await getContactByUpeerId(memberUpeerId);
        if (contact?.status === 'connected') {
            const addresses: string[] = [];
            if (contact.address) addresses.push(contact.address);
            try {
                const known = JSON.parse((contact as any).knownAddresses ?? '[]');
                for (const addr of known) if (!addresses.includes(addr)) addresses.push(addr);
            } catch { /* ignore */ }

            for (const addr of addresses) {
                sendSecureUDPMessage(addr, packet, contact.publicKey);
            }
        }
    }

    deleteMessagesByChatId(groupId);
    deleteGroup(groupId);
}