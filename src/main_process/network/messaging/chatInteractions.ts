import crypto from 'node:crypto';
import {
    getMyPublicKey,
    getMyUPeerId,
    sign,
} from '../../security/identity.js';
import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { getGroupById } from '../../storage/groups/operations.js';
import {
    getMessageById,
    saveMessage,
    updateMessageStatus,
} from '../../storage/messages/operations.js';
import { deleteReaction, saveReaction } from '../../storage/messages/reactions.js';
import { error } from '../../security/secure-logger.js';
import { canonicalStringify } from '../utils.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { emitMessageStatusUpdated, getFanOutAddresses, getSelfAddresses } from './chatSupport.js';

type ChatContactRecord = {
    upeerId: string;
    name?: string | null;
    address?: string | null;
    publicKey?: string | null;
    avatar?: string | null;
    status?: 'pending' | 'incoming' | 'connected' | 'offline' | 'disconnected';
    knownAddresses?: string | string[] | null;
};

type StoredMessageRecord = {
    senderUpeerId?: string | null;
};

type GroupRecordLike = {
    status: 'active' | 'invited';
    members: string[];
};

type ContactCardPayload = {
    name?: string | null;
    address?: string | null;
    upeerId?: string | null;
    publicKey?: string | null;
    avatar?: string | null;
};

export async function sendReadReceipt(upeerId: string, id: string): Promise<void> {
    const myId = getMyUPeerId();
    if (await updateMessageStatus(id, 'read')) {
        await emitMessageStatusUpdated(id, 'read');
    }

    const msg = await getMessageById(id) as StoredMessageRecord | undefined;
    if (!msg) return;
    const targetId = upeerId.startsWith('grp-') ? msg.senderUpeerId : upeerId;
    if (!targetId || targetId === myId) return;

    const contact = await getContactByUpeerId(targetId) as ChatContactRecord | undefined;
    if (!contact?.publicKey) return;

    const data = {
        type: 'READ',
        id,
        senderUpeerId: myId,
        ...(upeerId.startsWith('grp-') ? { chatUpeerId: upeerId } : {}),
    };
    const signature = sign(Buffer.from(canonicalStringify(data)));
    const signedData = { ...data, signature: signature.toString('hex') };
    const selfAddresses = await getSelfAddresses(myId);

    for (const address of getFanOutAddresses(contact)) {
        sendSecureUDPMessage(address, signedData, contact.publicKey);
    }

    const myPublicKey = getMyPublicKey().toString('hex');
    for (const address of selfAddresses) {
        sendSecureUDPMessage(address, signedData, myPublicKey, true);
    }

    import('../vault/manager.js').then(({ VaultManager }) => {
        VaultManager.replicateToVaults(targetId, signedData);
        if (selfAddresses.length < 1) VaultManager.replicateToVaults(myId, signedData);
    }).catch((err) => error('Failed to vault READ receipt', err, 'vault'));
}

export async function sendContactCard(targetUpeerId: string, contact: ContactCardPayload): Promise<string | undefined> {
    const targetContact = await getContactByUpeerId(targetUpeerId) as ChatContactRecord | undefined;
    if (!targetContact || targetContact.status !== 'connected' || !targetContact.publicKey) return undefined;

    const msgId = crypto.randomUUID();
    const serializedMessage = JSON.stringify({
        type: 'contact_card',
        text: '',
        contact: {
            name: contact.name || '',
            address: contact.address || '',
            upeerId: contact.upeerId || '',
            publicKey: contact.publicKey || '',
            avatar: contact.avatar || undefined,
        },
    });
    const data = {
        type: 'CHAT_CONTACT',
        id: msgId,
        contactName: contact.name,
        contactAddress: contact.address,
        upeerId: contact.upeerId,
        contactPublicKey: contact.publicKey,
        contactAvatar: contact.avatar,
    };
    const signature = sign(Buffer.from(canonicalStringify(data)));
    await saveMessage(msgId, targetUpeerId, true, serializedMessage, undefined, signature.toString('hex'));

    for (const address of getFanOutAddresses(targetContact)) {
        sendSecureUDPMessage(address, data, targetContact.publicKey);
    }
    return msgId;
}

export async function sendChatReaction(upeerId: string, msgId: string, emoji: string, remove: boolean): Promise<void> {
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
        ...(isGroup ? { chatUpeerId: upeerId } : {}),
    };
    const signature = sign(Buffer.from(canonicalStringify(data)));
    const signedData = { ...data, signature: signature.toString('hex') };
    const myPublicKey = getMyPublicKey().toString('hex');

    if (isGroup) {
        const group = getGroupById(upeerId) as GroupRecordLike | null;
        if (!group || group.status !== 'active') return;

        for (const memberId of group.members) {
            if (memberId === myId) continue;
            const contact = await getContactByUpeerId(memberId) as ChatContactRecord | undefined;
            if (contact?.status === 'connected' && contact.publicKey) {
                for (const address of getFanOutAddresses(contact)) {
                    sendSecureUDPMessage(address, signedData, contact.publicKey);
                }
            } else if (contact?.publicKey) {
                import('../vault/manager.js').then(({ VaultManager }) => {
                    VaultManager.replicateToVaults(memberId, signedData);
                });
            }
        }

        const selfAddresses = await getSelfAddresses(myId);
        for (const address of selfAddresses) {
            sendSecureUDPMessage(address, signedData, myPublicKey, true);
        }
        if (selfAddresses.length < 1) {
            import('../vault/manager.js').then(({ VaultManager }) => {
                VaultManager.replicateToVaults(myId, signedData);
            });
        }
        return;
    }

    const contact = await getContactByUpeerId(upeerId) as ChatContactRecord | undefined;
    if (!contact?.publicKey) return;
    for (const address of getFanOutAddresses(contact)) {
        sendSecureUDPMessage(address, signedData, contact.publicKey);
    }

    const selfAddresses = await getSelfAddresses(myId);
    for (const address of selfAddresses) {
        sendSecureUDPMessage(address, signedData, myPublicKey, true);
    }

    import('../vault/manager.js').then(({ VaultManager }) => {
        VaultManager.replicateToVaults(upeerId, signedData);
        if (selfAddresses.length < 1) {
            VaultManager.replicateToVaults(myId, signedData);
        }
    });
}
