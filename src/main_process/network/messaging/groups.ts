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
    saveMessage,
    getGroupById,
    saveGroup,
    updateGroupMembers,
    updateGroupInfo,
} from '../../storage/db.js';
import { warn } from '../../security/secure-logger.js';
import { canonicalStringify } from '../utils.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { EPH_FRESHNESS_MS } from '../server/constants.js';

function shouldUseEphemeral(contact: any): boolean {
    if (!contact?.ephemeralPublicKey) return false;
    const updatedAt = contact.ephemeralPublicKeyUpdatedAt
        ? new Date(contact.ephemeralPublicKeyUpdatedAt).getTime()
        : 0;
    return updatedAt > 0 && (Date.now() - updatedAt) < EPH_FRESHNESS_MS;
}

/**
 * Send a text message to a group (fan-out to each member).
 * Returns the generated message ID.
 */
export async function sendGroupMessage(
    groupId: string,
    message: string,
    replyTo?: string
): Promise<string | undefined> {
    const group = getGroupById(groupId);
    if (!group || group.status !== 'active') return undefined;

    const msgId = crypto.randomUUID();
    const myId = getMyUPeerId();

    // Save locally first
    const signature = sign(Buffer.from(message));
    saveMessage(msgId, groupId, true, message, replyTo, signature.toString('hex'), 'sent');

    // Fan-out: send to every member that is not us
    for (const memberUpeerId of group.members) {
        if (memberUpeerId === myId) continue;
        const contact = await getContactByUpeerId(memberUpeerId);
        if (!contact || contact.status !== 'connected' || !contact.publicKey) continue;

        const useEphemeral = shouldUseEphemeral(contact);
        const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;

        const ephPubKey = getMyEphemeralPublicKeyHex(); // capture before possible rotation
        const { ciphertext, nonce } = encrypt(
            Buffer.from(message, 'utf-8'),
            Buffer.from(targetKeyHex, 'hex'),
            useEphemeral
        );

        if (useEphemeral) incrementEphemeralMessageCounter();

        const data = {
            type: 'GROUP_MSG',
            id: msgId,
            groupId,
            groupName: group.name,
            senderUpeerId: myId,
            content: ciphertext.toString('hex'),
            nonce: nonce.toString('hex'),
            ephemeralPublicKey: ephPubKey,
            useRecipientEphemeral: useEphemeral,
            replyTo
            // members omitted: receiver already has the group roster locally;
            // including it leaks the full membership list to vault custodians
        };

        sendSecureUDPMessage(contact.address, data, contact.publicKey); // ← Sealed Sender

        // ── Resilience: vault fallback if the member appears offline later ──
        // We preemptively vault for members with low lastSeen recency or uncertain status
        // by not sending and instead vaulting when status is not 'connected'
    }

    // Vault for offline members (we have their pubkey from previous handshake)
    for (const memberUpeerId of group.members) {
        if (memberUpeerId === myId) continue;
        const contact = await getContactByUpeerId(memberUpeerId);
        // Skip if we just sent to them (connected) or if we have no key at all
        if (!contact || contact.status === 'connected' || !contact.publicKey) continue;

        // Offline members: always use static key — their stored eph key for us is certainly stale.
        const useEphemeral = false;
        const targetKeyHex = contact.publicKey;
        const ephPubKey = getMyEphemeralPublicKeyHex();
        const { ciphertext, nonce } = encrypt(
            Buffer.from(message, 'utf-8'),
            Buffer.from(targetKeyHex, 'hex'),
            useEphemeral
        );
        const offlinePacket = {
            type: 'GROUP_MSG',
            id: msgId,
            groupId,
            // groupName omitido: el receptor lo tiene en su BD desde GROUP_INVITE.
            // senderUpeerId omitido: el custodio lo conoce del protocolo VAULT_STORE
            // (entry.senderSid) — no hace falta exponerlo dentro del payload cifrado.
            content: ciphertext.toString('hex'),
            nonce: nonce.toString('hex'),
            useRecipientEphemeral: useEphemeral,
            replyTo
        };
        const signedPacket = {
            ...offlinePacket,
            signature: sign(Buffer.from(canonicalStringify(offlinePacket))).toString('hex')
        };
        const { VaultManager } = await import('../vault/manager.js');
        // CID determinista: group:msgId:memberUpeerId
        // → si varios miembros online intentan vaultear el mismo mensaje para el mismo offline,
        //   saveVaultEntry usa onConflictDoUpdate → un solo slot por (mensaje, miembro).
        const payloadHashOverride = crypto.createHash('sha256')
            .update(`group:${msgId}:${memberUpeerId}`)
            .digest('hex');
        await VaultManager.replicateToVaults(memberUpeerId, signedPacket, undefined, payloadHashOverride);
    }

    return msgId;
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
    await _sendGroupInvite(groupId, group.name, newMembers, upeerId);
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
    const sensitivePayload = JSON.stringify({
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
        const useEphemeral = shouldUseEphemeral(contact);
        const targetKeyHex = useEphemeral ? contact.ephemeralPublicKey : contact.publicKey;
        const ephPubKey = getMyEphemeralPublicKeyHex(); // capture before possible rotation
        const { ciphertext, nonce } = encrypt(
            Buffer.from(sensitivePayload, 'utf-8'),
            Buffer.from(targetKeyHex, 'hex'),
            useEphemeral
        );
        if (useEphemeral) incrementEphemeralMessageCounter();

        const packet = {
            type: 'GROUP_UPDATE',
            groupId,
            adminUpeerId: myId,
            payload: ciphertext.toString('hex'),
            nonce: nonce.toString('hex'),
            ephemeralPublicKey: ephPubKey,
            useRecipientEphemeral: useEphemeral,
        };

        if (contact.status === 'connected') {
            sendSecureUDPMessage(contact.address, packet);
        } else {
            const signedPacket = {
                ...packet,
                senderUpeerId: myId,
                signature: sign(Buffer.from(canonicalStringify(packet))).toString('hex')
            };
            const { VaultManager } = await import('../vault/manager.js');
            await VaultManager.replicateToVaults(memberUpeerId, signedPacket);
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
    const sensitivePayload = JSON.stringify({ groupName, members, ...(avatar ? { avatar } : {}) });
    const ephPubKey = getMyEphemeralPublicKeyHex(); // capture before possible rotation
    const { ciphertext, nonce } = encrypt(
        Buffer.from(sensitivePayload, 'utf-8'),
        Buffer.from(targetKeyHex, 'hex'),
        useEphemeral
    );
    if (useEphemeral) incrementEphemeralMessageCounter();

    const packet = {
        type: 'GROUP_INVITE',
        groupId,
        adminUpeerId: myId,
        payload: ciphertext.toString('hex'),
        nonce: nonce.toString('hex'),
        ephemeralPublicKey: ephPubKey,
        useRecipientEphemeral: useEphemeral,
    };

    if (contact.status === 'connected') {
        sendSecureUDPMessage(contact.address, packet);
    } else {
        // Vault the encrypted invite for when the member comes back online
        const signedPacket = {
            ...packet,
            senderUpeerId: myId,
            signature: sign(Buffer.from(canonicalStringify(packet))).toString('hex')
        };
        const { VaultManager } = await import('../vault/manager.js');
        await VaultManager.replicateToVaults(targetUpeerId, signedPacket);
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
        if (contact?.status === 'connected' && contact.address) {
            sendSecureUDPMessage(contact.address, packet);
        }
    }

    // Delete locally
    const { deleteGroup, deleteMessagesByChatId } = await import('../../storage/db.js');
    deleteMessagesByChatId(groupId);
    deleteGroup(groupId);
}