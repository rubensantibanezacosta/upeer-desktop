import {
    getMyPublicKey,
    getMySignedPreKey,
    getMyUPeerId,
    sign,
} from '../../security/identity.js';
import { getContactByUpeerId, getContacts } from '../../storage/contacts/operations.js';
import { getGroupById } from '../../storage/groups/operations.js';
import {
    deleteMessageLocally,
    getMessageById,
    updateMessageContent,
} from '../../storage/messages/operations.js';
import { error, warn } from '../../security/secure-logger.js';
import { buildMessagePayload } from '../messagePayload.js';
import { canonicalStringify } from '../utils.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { MAX_MESSAGE_SIZE_BYTES } from '../server/constants.js';
import { encryptChatPayload } from './chatEncryption.js';
import { getFanOutAddresses, getSelfAddresses } from './chatSupport.js';
import { registerEncryptedOperationRetry } from './encryptedOperationRetry.js';

type LinkPreviewPayload = Record<string, unknown>;

type ChatContactRecord = {
    upeerId: string;
    publicKey?: string | null;
    status?: 'pending' | 'incoming' | 'connected' | 'offline' | 'disconnected';
    address?: string | null;
    knownAddresses?: string | string[] | null;
};

type StoredMessageRecord = {
    version?: number | null;
    message?: string;
};

type GroupRecordLike = {
    members: string[];
};

type DhtContactNode = {
    upeerId?: string;
    address: string;
};

type KademliaContactLookup = {
    findClosestContacts(targetId: string, count: number): DhtContactNode[];
};

export async function sendChatUpdate(upeerId: string, msgId: string, newContent: string, linkPreview?: LinkPreviewPayload | null): Promise<void> {
    if (newContent.length > MAX_MESSAGE_SIZE_BYTES) {
        error(`Chat update size exceeds limit (${newContent.length} > ${MAX_MESSAGE_SIZE_BYTES})`, { upeerId, msgId }, 'security');
        return;
    }

    const existing = await getMessageById(msgId) as StoredMessageRecord | undefined;
    const newVersion = (existing?.version ?? 0) + 1;
    const myId = getMyUPeerId();
    const isGroup = upeerId.startsWith('grp-');
    const urlFirstRegex = /(https?:\/\/[^\s<>"']+)/i;
    const urlMatch = urlFirstRegex.exec(newContent);
    let payload = newContent;

    if (linkPreview) {
        payload = await buildMessagePayload(newContent, linkPreview as never);
    } else if (urlMatch) {
        const { fetchOgPreview } = await import('../og-fetcher.js');
        const preview = await fetchOgPreview(urlMatch[1]);
        if (preview) payload = await buildMessagePayload(newContent, preview);
    }

    const signature = sign(Buffer.from(payload));
    updateMessageContent(msgId, payload, signature.toString('hex'), newVersion);

    const broadcastUpdate = async (
        targetId: string,
        isGroupContext: boolean,
        options?: { skipVault?: boolean; registerRetry?: boolean }
    ) => {
        const contact = await getContactByUpeerId(targetId) as ChatContactRecord | undefined;
        if (!contact || !contact.publicKey) return;
        const encrypted = await encryptChatPayload(targetId, payload, contact);
        const data = {
            type: 'CHAT_UPDATE',
            msgId,
            content: encrypted.content,
            nonce: encrypted.nonce,
            version: newVersion,
            ...(encrypted.ratchetHeader ? { ratchetHeader: encrypted.ratchetHeader } : {}),
            ...(encrypted.x3dhInit ? { x3dhInit: encrypted.x3dhInit } : {}),
            ...(encrypted.ephemeralPublicKey ? { ephemeralPublicKey: encrypted.ephemeralPublicKey } : {}),
            ...(encrypted.useRecipientEphemeral !== undefined ? { useRecipientEphemeral: encrypted.useRecipientEphemeral } : {}),
            ...(isGroupContext ? { chatUpeerId: upeerId } : {}),
        };
        const dataSignature = sign(Buffer.from(canonicalStringify(data)));
        const signedData = { ...data, signature: dataSignature.toString('hex'), senderUpeerId: myId };
        if (contact.status === 'connected') {
            for (const address of getFanOutAddresses(contact)) {
                sendSecureUDPMessage(address, signedData, contact.publicKey);
            }
            if (options?.registerRetry !== false) {
                registerEncryptedOperationRetry(targetId, `chat-update:${msgId}`, async () => {
                    await broadcastUpdate(targetId, isGroupContext, { skipVault: true, registerRetry: false });
                });
            }
        }
        if (!options?.skipVault) {
            import('../vault/manager.js').then(({ VaultManager }) => {
                VaultManager.replicateToVaults(targetId, signedData);
            });
        }
    };

    if (isGroup) {
        const group = await getGroupById(upeerId) as GroupRecordLike | null;
        if (!group) return;
        for (const memberId of group.members) {
            if (memberId === myId) continue;
            void broadcastUpdate(memberId, true);
        }
    } else {
        void broadcastUpdate(upeerId, false);
    }

    const selfSyncPacket = {
        type: 'CHAT_UPDATE',
        msgId,
        content: payload,
        version: newVersion,
        chatUpeerId: upeerId,
        senderUpeerId: myId,
    };
    const selfSyncSignature = sign(Buffer.from(canonicalStringify(selfSyncPacket)));
    const signedSelfSync = { ...selfSyncPacket, signature: selfSyncSignature.toString('hex') };
    const selfAddresses = await getSelfAddresses(myId);
    const myPublicKey = getMyPublicKey().toString('hex');
    for (const address of selfAddresses) {
        sendSecureUDPMessage(address, signedSelfSync, myPublicKey, true);
    }
    import('../vault/manager.js').then(async ({ VaultManager }) => {
        const mySignedPreKey = getMySignedPreKey();
        const selfEncrypted = await encryptChatPayload(myId, payload, {
            publicKey: myPublicKey,
            signedPreKey: mySignedPreKey.spkPub,
            signedPreKeyId: mySignedPreKey.spkId,
        });
        const selfVaultPacket = {
            type: 'CHAT_UPDATE',
            msgId,
            content: selfEncrypted.content,
            nonce: selfEncrypted.nonce,
            version: newVersion,
            chatUpeerId: upeerId,
            ...(selfEncrypted.ratchetHeader ? { ratchetHeader: selfEncrypted.ratchetHeader } : {}),
            ...(selfEncrypted.x3dhInit ? { x3dhInit: selfEncrypted.x3dhInit } : {}),
            ...(selfEncrypted.ephemeralPublicKey ? { ephemeralPublicKey: selfEncrypted.ephemeralPublicKey } : {}),
            ...(selfEncrypted.useRecipientEphemeral !== undefined ? { useRecipientEphemeral: selfEncrypted.useRecipientEphemeral } : {}),
            senderUpeerId: myId,
        };
        const selfVaultSignature = sign(Buffer.from(canonicalStringify(selfVaultPacket)));
        await VaultManager.replicateToVaults(myId, {
            ...selfVaultPacket,
            signature: selfVaultSignature.toString('hex')
        });
    });
}

export async function sendChatDelete(upeerId: string, msgId: string): Promise<void> {
    const myId = getMyUPeerId();
    const isGroup = upeerId.startsWith('grp-');
    const msg = await getMessageById(msgId) as StoredMessageRecord | undefined;
    const { cleanupLocalAttachmentFile, extractLocalAttachmentInfo } = await import('../../utils/localAttachmentCleanup.js');
    const attachment = typeof msg?.message === 'string' ? extractLocalAttachmentInfo(msg.message) : null;
    if (attachment?.fileId) {
        const { fileTransferManager } = await import('../file-transfer/transfer-manager.js');
        fileTransferManager.cancelTransfer(attachment.fileId, 'message deleted');
    }
    await cleanupLocalAttachmentFile(attachment?.filePath);
    deleteMessageLocally(msgId);

    const data = {
        type: 'CHAT_DELETE',
        msgId,
        timestamp: Date.now(),
        ...(isGroup ? { chatUpeerId: upeerId } : {}),
    };
    const signature = sign(Buffer.from(canonicalStringify(data)));
    const signedData = { ...data, signature: signature.toString('hex'), senderUpeerId: myId };
    const myPublicKey = getMyPublicKey().toString('hex');

    const broadcastDelete = async (targetId: string) => {
        const contact = await getContactByUpeerId(targetId) as ChatContactRecord | undefined;
        if (contact && contact.status === 'connected' && contact.publicKey) {
            for (const address of getFanOutAddresses(contact)) {
                sendSecureUDPMessage(address, signedData, contact.publicKey);
            }
        }
        import('../vault/manager.js').then(({ VaultManager }) => {
            VaultManager.replicateToVaults(targetId, signedData);
        });
    };

    if (isGroup) {
        const group = await getGroupById(upeerId) as GroupRecordLike | null;
        if (group) {
            for (const memberId of group.members) {
                if (memberId === myId) continue;
                void broadcastDelete(memberId);
            }
        }
    } else {
        void broadcastDelete(upeerId);
    }

    const selfAddresses = await getSelfAddresses(myId);
    for (const address of selfAddresses) {
        sendSecureUDPMessage(address, signedData, myPublicKey, true);
    }
    (async () => {
        const { VaultManager } = await import('../vault/manager.js');
        VaultManager.replicateToVaults(myId, signedData);
    })();

    const allContacts = await getContacts();
    const trustedFriends = (allContacts as ChatContactRecord[]).filter((contact) => contact.status === 'connected' && contact.upeerId !== myId && contact.upeerId !== upeerId);
    for (const friend of trustedFriends.slice(0, 3)) {
        import('../vault/manager.js').then(({ VaultManager }) => {
            VaultManager.replicateToVaults(friend.upeerId, signedData);
        });
    }
}

export async function sendChatClear(upeerId: string, customTimestamp?: number): Promise<void> {
    const myId = getMyUPeerId();
    const myPublicKey = getMyPublicKey().toString('hex');
    const timestamp = customTimestamp || Date.now();
    const data = {
        type: 'CHAT_CLEAR_ALL',
        chatUpeerId: upeerId,
        timestamp,
    };

    try {
        const { getKademliaInstance } = await import('../dht/handlers.js');
        const kademlia = getKademliaInstance() as KademliaContactLookup | null;
        const myYggAddress = (await import('../../sidecars/yggstack.js')).getYggstackAddress();
        if (kademlia) {
            const selfNodes = kademlia.findClosestContacts(myId, 20)
                .filter((node) => node.upeerId === myId && node.address !== myYggAddress);
            for (const node of selfNodes) {
                sendSecureUDPMessage(node.address, data, myPublicKey);
            }
        }
    } catch (err) {
        warn('Failed to fan-out CHAT_CLEAR_ALL to other own devices', { upeerId, err: String(err) }, 'network');
    }

    const signature = sign(Buffer.from(canonicalStringify(data)));
    const vaultPacket = { ...data, senderUpeerId: myId, signature: signature.toString('hex') };
    const { deleteMessagesByChatId } = await import('../../storage/messages/operations.js');
    deleteMessagesByChatId(upeerId, timestamp);

    (async () => {
        const { VaultManager } = await import('../vault/manager.js');
        await VaultManager.replicateToVaults(myId, vaultPacket);
        const allContacts = await getContacts();
        const trustedFriends = (allContacts as ChatContactRecord[]).filter((contact) => contact && contact.upeerId !== myId);
        for (const friend of trustedFriends.slice(0, 3)) {
            await VaultManager.replicateToVaults(friend.upeerId, vaultPacket);
        }
    })();
}
