import { BrowserWindow } from 'electron';
import { verify, getMyUPeerId, setMyAlias, setMyAvatar } from '../security/identity.js';
import { info, warn } from '../security/secure-logger.js';
import { fileTransferManager } from './file-transfer/transfer-manager.js';
import { handleChatAck, handleChatClear, handleChatContact, handleChatDelete, handleChatEdit, handleChatMessage, handleChatReaction } from './handlers/chat.js';
import { handleGroupAck, handleGroupInvite, handleGroupLeave, handleGroupMessage, handleGroupUpdate } from './handlers/groups.js';
import { handleReputationDeliver, handleReputationGossip, handleReputationRequest } from './handlers/reputation.js';
import { handleSyncPulse } from './handlers/sync.js';
import { handleVaultDelivery } from './handlers/vault.js';
import type { GroupAckPayload, GroupMessagePayload, VaultQueryData, VaultStoreData } from './types.js';
import type { GroupControlPacket } from './handlers/groupControlShared.js';
import type { RatchetHeader } from '../security/ratchetShared.js';

const vaultQueryThrottle = new Map<string, number>();

type VerifiedContact = {
    publicKey: string;
    signedPreKeyId?: number | null;
    name?: string;
    alias?: string;
    address?: string;
};

type SignedPreKeyPayload = {
    spkPub?: unknown;
    spkSig?: unknown;
    spkId?: unknown;
};

type VerifiedPacketData = {
    type: string;
    alias?: unknown;
    avatar?: unknown;
    signedPreKey?: SignedPreKeyPayload | unknown;
    [key: string]: unknown;
};

type VerifiedPacketArgs = {
    upeerId: string;
    contact: VerifiedContact;
    data: VerifiedPacketData;
    signature: string;
    rinfo: { address: string; port: number };
    win: BrowserWindow | null;
    sendResponse: (ip: string, data: Record<string, unknown>) => void;
};

type IdentityUpdatePayload = {
    alias?: string;
    avatar?: string;
};

type ChatContactRecord = {
    upeerId: string;
    publicKey?: string;
    name?: string;
    alias?: string;
};

type ChatX3dhInit = {
    ikPub: string;
    ekPub: string;
    spkId: number;
};

type ChatIncomingPayload = {
    id?: string;
    content: string;
    nonce?: string;
    ephemeralPublicKey?: string;
    replyTo?: string;
    x3dhInit?: ChatX3dhInit;
    ratchetHeader?: RatchetHeader;
    isInternalSync?: boolean;
    timestamp?: number;
    useRecipientEphemeral?: boolean;
};

type ChatAckPayload = {
    id?: string;
    status?: 'sent' | 'delivered' | 'read' | 'failed' | 'vaulted';
};

type ChatContactPacket = {
    id?: string;
    timestamp?: number;
    contactName?: string;
    contactAddress?: string;
    upeerId?: string;
    contactPublicKey?: string;
    contactAvatar?: string;
};

type EditableChatPayload = {
    id?: string;
    msgId?: string;
    content?: string;
    newContent?: string;
    nonce?: string;
    ephemeralPublicKey?: string;
    useRecipientEphemeral?: boolean;
    chatUpeerId?: string;
    isInternalSync?: boolean;
    version?: number;
};

type ChatDeletePayload = {
    id?: string;
    msgId?: string;
    chatUpeerId?: string;
    isInternalSync?: boolean;
    timestamp?: number;
};

type ChatClearPayload = {
    chatUpeerId?: string;
    clearTimestamp?: number;
    timestamp?: number;
};

type ChatReactionPayload = {
    id?: string;
    msgId?: string;
    chatUpeerId?: string;
    emoji?: string;
    reaction?: string;
    emojiToDelete?: string;
    remove?: boolean;
};

type VaultAckPayload = {
    payloadHashes: string[];
};

type VaultRenewPayload = {
    payloadHash: string;
    newExpiresAt: number;
};

type VaultDeliveryPayload = {
    entries?: unknown;
    hasMore?: unknown;
    nextOffset?: unknown;
};

type SyncPulsePayload = {
    deviceId?: string;
    action?: string;
    messageId?: string;
    newContent?: string;
};

type ReputationGossipPayload = {
    ids?: unknown;
};

type ReputationRequestPayload = {
    missing?: unknown;
};

type ReputationDeliverPayload = {
    vouches?: unknown;
};

type GroupInvitePacket = GroupControlPacket & {
    payload: string;
    nonce: string;
};

function isSignedPreKeyPayload(value: unknown): value is { spkPub: string; spkSig: string; spkId: number } {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as SignedPreKeyPayload;
    return typeof candidate.spkPub === 'string'
        && typeof candidate.spkSig === 'string'
        && typeof candidate.spkId === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isChatX3dhInit(value: unknown): value is ChatX3dhInit {
    if (!isRecord(value)) {
        return false;
    }

    return typeof value.ikPub === 'string'
        && typeof value.ekPub === 'string'
        && typeof value.spkId === 'number';
}

function isRatchetHeader(value: unknown): value is RatchetHeader {
    if (!isRecord(value)) {
        return false;
    }

    return typeof value.dh === 'string'
        && typeof value.pn === 'number'
        && typeof value.n === 'number';
}

function toChatContactRecord(upeerId: string, contact: VerifiedContact): ChatContactRecord {
    return {
        upeerId,
        publicKey: contact.publicKey,
        name: contact.name,
        alias: contact.alias,
    };
}

function toGroupContact(contact: VerifiedContact, address: string): { name?: string; alias?: string; address?: string } {
    return {
        name: contact.name,
        alias: contact.alias,
        address: contact.address ?? address,
    };
}

function toChatIncomingPayload(data: VerifiedPacketData): ChatIncomingPayload {
    const content = typeof data.content === 'string'
        ? data.content
        : typeof data.text === 'string'
            ? data.text
            : '';

    return {
        id: typeof data.id === 'string' ? data.id : undefined,
        content,
        nonce: typeof data.nonce === 'string' ? data.nonce : undefined,
        ephemeralPublicKey: typeof data.ephemeralPublicKey === 'string' ? data.ephemeralPublicKey : undefined,
        replyTo: typeof data.replyTo === 'string' ? data.replyTo : undefined,
        x3dhInit: isChatX3dhInit(data.x3dhInit) ? data.x3dhInit : undefined,
        ratchetHeader: isRatchetHeader(data.ratchetHeader) ? data.ratchetHeader : undefined,
        isInternalSync: data.isInternalSync === true,
        timestamp: typeof data.timestamp === 'number' ? data.timestamp : undefined,
        useRecipientEphemeral: typeof data.useRecipientEphemeral === 'boolean' ? data.useRecipientEphemeral : undefined,
    };
}

function toChatAckPayload(data: VerifiedPacketData): ChatAckPayload {
    return {
        id: typeof data.id === 'string' ? data.id : typeof data.msgId === 'string' ? data.msgId : undefined,
        status: data.status === 'sent' || data.status === 'delivered' || data.status === 'read' || data.status === 'failed' || data.status === 'vaulted'
            ? data.status
            : undefined,
    };
}

function toChatContactPacket(data: VerifiedPacketData): ChatContactPacket {
    return {
        id: typeof data.id === 'string' ? data.id : undefined,
        timestamp: typeof data.timestamp === 'number' ? data.timestamp : undefined,
        contactName: typeof data.contactName === 'string' ? data.contactName : undefined,
        contactAddress: typeof data.contactAddress === 'string' ? data.contactAddress : undefined,
        upeerId: typeof data.upeerId === 'string' ? data.upeerId : undefined,
        contactPublicKey: typeof data.contactPublicKey === 'string' ? data.contactPublicKey : undefined,
        contactAvatar: typeof data.contactAvatar === 'string' ? data.contactAvatar : undefined,
    };
}

function toEditableChatPayload(data: VerifiedPacketData): EditableChatPayload {
    return {
        id: typeof data.id === 'string' ? data.id : undefined,
        msgId: typeof data.msgId === 'string' ? data.msgId : undefined,
        content: typeof data.content === 'string' ? data.content : undefined,
        newContent: typeof data.newContent === 'string' ? data.newContent : undefined,
        nonce: typeof data.nonce === 'string' ? data.nonce : undefined,
        ephemeralPublicKey: typeof data.ephemeralPublicKey === 'string' ? data.ephemeralPublicKey : undefined,
        useRecipientEphemeral: typeof data.useRecipientEphemeral === 'boolean' ? data.useRecipientEphemeral : undefined,
        chatUpeerId: typeof data.chatUpeerId === 'string' ? data.chatUpeerId : undefined,
        isInternalSync: data.isInternalSync === true,
        version: typeof data.version === 'number' ? data.version : undefined,
    };
}

function toChatDeletePayload(data: VerifiedPacketData): ChatDeletePayload {
    return {
        id: typeof data.id === 'string' ? data.id : undefined,
        msgId: typeof data.msgId === 'string' ? data.msgId : undefined,
        chatUpeerId: typeof data.chatUpeerId === 'string' ? data.chatUpeerId : undefined,
        isInternalSync: data.isInternalSync === true,
        timestamp: typeof data.timestamp === 'number' ? data.timestamp : undefined,
    };
}

function toChatClearPayload(data: VerifiedPacketData): ChatClearPayload {
    return {
        chatUpeerId: typeof data.chatUpeerId === 'string' ? data.chatUpeerId : undefined,
        clearTimestamp: typeof data.clearTimestamp === 'number' ? data.clearTimestamp : undefined,
        timestamp: typeof data.timestamp === 'number' ? data.timestamp : undefined,
    };
}

function toChatReactionPayload(data: VerifiedPacketData): ChatReactionPayload {
    return {
        id: typeof data.id === 'string' ? data.id : undefined,
        msgId: typeof data.msgId === 'string' ? data.msgId : undefined,
        chatUpeerId: typeof data.chatUpeerId === 'string' ? data.chatUpeerId : undefined,
        emoji: typeof data.emoji === 'string' ? data.emoji : undefined,
        reaction: typeof data.reaction === 'string' ? data.reaction : undefined,
        emojiToDelete: typeof data.emojiToDelete === 'string' ? data.emojiToDelete : undefined,
        remove: data.remove === true,
    };
}

function toVaultAckPayload(data: VerifiedPacketData): VaultAckPayload {
    return {
        payloadHashes: Array.isArray(data.payloadHashes)
            ? data.payloadHashes.filter((value): value is string => typeof value === 'string')
            : [],
    };
}

function toVaultRenewPayload(data: VerifiedPacketData): VaultRenewPayload {
    return {
        payloadHash: typeof data.payloadHash === 'string' ? data.payloadHash : '',
        newExpiresAt: typeof data.newExpiresAt === 'number' ? data.newExpiresAt : 0,
    };
}

function toVaultDeliveryPayload(data: VerifiedPacketData): VaultDeliveryPayload {
    return {
        entries: data.entries ?? data.vaultData,
        hasMore: data.hasMore,
        nextOffset: data.nextOffset,
    };
}

function toGroupMessagePayload(data: VerifiedPacketData): GroupMessagePayload {
    return {
        id: typeof data.id === 'string' ? data.id : undefined,
        groupId: typeof data.groupId === 'string' ? data.groupId : '',
        content: typeof data.content === 'string' ? data.content : typeof data.text === 'string' ? data.text : '',
        nonce: typeof data.nonce === 'string' ? data.nonce : '',
        replyTo: typeof data.replyTo === 'string' ? data.replyTo : undefined,
        timestamp: typeof data.timestamp === 'number' ? data.timestamp : undefined,
        epoch: typeof data.epoch === 'number' ? data.epoch : 0,
        isInternalSync: data.isInternalSync === true,
    };
}

function toGroupAckPayload(data: VerifiedPacketData): GroupAckPayload {
    return {
        id: typeof data.id === 'string' ? data.id : typeof data.msgId === 'string' ? data.msgId : '',
        groupId: typeof data.groupId === 'string' ? data.groupId : '',
    };
}

function toGroupControlPacket(data: VerifiedPacketData): GroupControlPacket {
    return {
        groupId: typeof data.groupId === 'string' ? data.groupId : '',
        payload: typeof data.payload === 'string' ? data.payload : undefined,
        nonce: typeof data.nonce === 'string' ? data.nonce : undefined,
        adminUpeerId: typeof data.adminUpeerId === 'string' ? data.adminUpeerId : undefined,
        ephemeralPublicKey: typeof data.ephemeralPublicKey === 'string' ? data.ephemeralPublicKey : undefined,
        useRecipientEphemeral: typeof data.useRecipientEphemeral === 'boolean' ? data.useRecipientEphemeral : undefined,
        signature: typeof data.signature === 'string' ? data.signature : undefined,
        isInternalSync: data.isInternalSync === true,
    };
}

function toGroupInvitePacket(data: VerifiedPacketData): GroupInvitePacket {
    const packet = toGroupControlPacket(data);

    return {
        ...packet,
        payload: typeof packet.payload === 'string' ? packet.payload : '',
        nonce: typeof packet.nonce === 'string' ? packet.nonce : '',
    };
}

function toSyncPulsePayload(data: VerifiedPacketData): SyncPulsePayload {
    return {
        deviceId: typeof data.deviceId === 'string' ? data.deviceId : undefined,
        action: typeof data.action === 'string' ? data.action : undefined,
        messageId: typeof data.messageId === 'string' ? data.messageId : undefined,
        newContent: typeof data.newContent === 'string' ? data.newContent : undefined,
    };
}

function toReputationGossipPayload(data: VerifiedPacketData): ReputationGossipPayload {
    return { ids: data.ids };
}

function toReputationRequestPayload(data: VerifiedPacketData): ReputationRequestPayload {
    return { missing: data.missing };
}

function toReputationDeliverPayload(data: VerifiedPacketData): ReputationDeliverPayload {
    return { vouches: data.vouches };
}

function maybeQueryVaultsForPeer(upeerId: string) {
    const last = vaultQueryThrottle.get(upeerId) ?? 0;
    if (Date.now() - last < 30_000) return;
    vaultQueryThrottle.set(upeerId, Date.now());
    import('./vault/manager.js').then(({ VaultManager }) => VaultManager.queryOwnVaults()).catch((err) => {
        warn('Failed to query own vaults for peer activity', err, 'vault');
    });
}

async function handlePingProfileUpdate(upeerId: string, contact: VerifiedContact, data: VerifiedPacketData) {
    const alias = typeof data.alias === 'string' ? data.alias : undefined;
    if (alias) {
        import('../storage/contacts/operations.js').then(({ updateContactName }) => {
            updateContactName?.(upeerId, alias.slice(0, 100));
        }).catch((err) => warn('Failed to update contact name', err, 'network'));
    }
    const avatar = typeof data.avatar === 'string' ? data.avatar : undefined;
    if (avatar && avatar.startsWith('data:image/') && avatar.length <= 2_000_000) {
        import('../storage/contacts/operations.js').then(({ updateContactAvatar }) => {
            updateContactAvatar?.(upeerId, avatar);
        }).catch((err) => warn('Failed to update contact avatar', err, 'network'));
    }
    if (isSignedPreKeyPayload(data.signedPreKey)) {
        const { spkPub, spkSig, spkId: newSpkId } = data.signedPreKey;
        if (!contact.signedPreKeyId || newSpkId > contact.signedPreKeyId) {
            const spkValid = verify(
                Buffer.from(spkPub, 'hex'),
                Buffer.from(spkSig, 'hex'),
                Buffer.from(contact.publicKey, 'hex')
            );
            if (spkValid) {
                import('../storage/contacts/keys.js').then(({ updateContactSignedPreKey }) => {
                    updateContactSignedPreKey(upeerId, spkPub, spkSig, newSpkId);
                }).catch(err => warn('Failed to update SPK from PING', err, 'security'));
            }
        }
    }
}

export async function routeVerifiedPacket(args: VerifiedPacketArgs): Promise<void> {
    const { upeerId, contact, data, signature, rinfo, win, sendResponse } = args;
    const chatContact = toChatContactRecord(upeerId, contact);
    const groupContact = toGroupContact(contact, rinfo.address);

    switch (data.type) {
        case 'PING':
            sendResponse(rinfo.address, { type: 'PONG' });
            maybeQueryVaultsForPeer(upeerId);
            await handlePingProfileUpdate(upeerId, contact, data);
            break;
        case 'PONG':
            maybeQueryVaultsForPeer(upeerId);
            break;
        case 'VAULT_STORE':
            await (await import('./vault/protocol/handlers.js')).handleVaultStore(upeerId, data as unknown as VaultStoreData, rinfo.address, sendResponse);
            break;
        case 'VAULT_QUERY':
            await (await import('./vault/protocol/handlers.js')).handleVaultQuery(upeerId, data as unknown as VaultQueryData, rinfo.address, sendResponse);
            break;
        case 'VAULT_ACK':
            await (await import('./vault/protocol/handlers.js')).handleVaultAck(upeerId, toVaultAckPayload(data));
            break;
        case 'VAULT_DELIVERY':
            await handleVaultDelivery(upeerId, toVaultDeliveryPayload(data), win, sendResponse, rinfo.address);
            break;
        case 'VAULT_RENEW':
            await (await import('./vault/protocol/handlers.js')).handleVaultRenew(upeerId, toVaultRenewPayload(data));
            break;
        case 'CHAT':
            handleChatMessage(upeerId, chatContact, toChatIncomingPayload(data), win, signature, rinfo.address, sendResponse);
            break;
        case 'ACK':
            handleChatAck(upeerId, toChatAckPayload(data), win);
            break;
        case 'READ':
            handleChatAck(upeerId, { ...toChatAckPayload(data), status: 'read' }, win);
            break;
        case 'TYPING':
            win?.webContents.send('peer-typing', { upeerId: upeerId });
            break;
        case 'CHAT_CONTACT':
            await handleChatContact(upeerId, toChatContactPacket(data), win, signature, rinfo.address, sendResponse);
            break;
        case 'CHAT_REACTION':
            handleChatReaction(upeerId, toChatReactionPayload(data), win);
            break;
        case 'CHAT_UPDATE':
            handleChatEdit(upeerId, toEditableChatPayload(data), win, signature);
            break;
        case 'CHAT_DELETE':
            handleChatDelete(upeerId, toChatDeletePayload(data), win);
            break;
        case 'CHAT_CLEAR_ALL':
            handleChatClear(upeerId, toChatClearPayload(data), win);
            break;
        case 'IDENTITY_UPDATE':
            if (upeerId === getMyUPeerId()) {
                const payload: IdentityUpdatePayload = {};
                if (typeof data.alias === 'string') {
                    setMyAlias(data.alias);
                    payload.alias = data.alias;
                }
                if (typeof data.avatar === 'string') {
                    setMyAvatar(data.avatar);
                    payload.avatar = data.avatar;
                }
                win?.webContents.send('identity-updated', payload);
            }
            break;
        case 'FILE_PROPOSAL':
        case 'FILE_START':
        case 'FILE_ACCEPT':
        case 'FILE_CHUNK':
        case 'FILE_CHUNK_ACK':
        case 'FILE_ACK':
        case 'FILE_DONE':
        case 'FILE_DONE_ACK':
        case 'FILE_END':
        case 'FILE_CANCEL':
            fileTransferManager.handleMessage(upeerId, rinfo.address, data);
            break;
        case 'GROUP_MSG':
            handleGroupMessage(upeerId, groupContact, toGroupMessagePayload(data), win, rinfo.address);
            break;
        case 'GROUP_ACK':
            handleGroupAck(upeerId, toGroupAckPayload(data), win);
            break;
        case 'GROUP_INVITE':
            handleGroupInvite(upeerId, toGroupInvitePacket(data), win);
            break;
        case 'GROUP_UPDATE':
            handleGroupUpdate(upeerId, toGroupControlPacket(data), win);
            break;
        case 'GROUP_LEAVE':
            handleGroupLeave(upeerId, toGroupControlPacket(data), win);
            break;
        case 'SYNC_PULSE':
            await handleSyncPulse(upeerId, toSyncPulsePayload(data), win);
            break;
        case 'REPUTATION_GOSSIP':
            handleReputationGossip(upeerId, toReputationGossipPayload(data), sendResponse, rinfo);
            break;
        case 'REPUTATION_REQUEST':
            handleReputationRequest(upeerId, toReputationRequestPayload(data), sendResponse, rinfo);
            break;
        case 'REPUTATION_DELIVER':
            handleReputationDeliver(upeerId, toReputationDeliverPayload(data));
            break;
        case 'DR_RESET': {
            const { deleteRatchetSession } = await import('../storage/ratchet/operations.js');
            deleteRatchetSession(upeerId);
            if (isSignedPreKeyPayload(data.signedPreKey)) {
                const { spkPub, spkSig, spkId: newSpkId } = data.signedPreKey;
                const spkValid = verify(
                    Buffer.from(spkPub, 'hex'),
                    Buffer.from(spkSig, 'hex'),
                    Buffer.from(contact.publicKey, 'hex')
                );
                if (spkValid) {
                    const { updateContactSignedPreKey } = await import('../storage/contacts/keys.js');
                    updateContactSignedPreKey(upeerId, spkPub, spkSig, newSpkId);
                }
            }
            info('DR session reset by peer', { upeerId }, 'security');
            break;
        }
        default:
            warn('Unknown packet', { upeerId, type: data.type, ip: rinfo.address }, 'network');
    }
}
