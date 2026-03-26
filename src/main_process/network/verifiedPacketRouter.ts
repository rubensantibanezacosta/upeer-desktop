import { BrowserWindow } from 'electron';
import { verify, getMyUPeerId, setMyAlias, setMyAvatar } from '../security/identity.js';
import { info, warn } from '../security/secure-logger.js';
import { fileTransferManager } from './file-transfer/transfer-manager.js';
import { handleChatAck, handleChatDelete, handleChatEdit, handleChatMessage, handleChatReaction, handleChatClear } from './handlers/chat.js';
import { handleGroupAck, handleGroupInvite, handleGroupLeave, handleGroupMessage, handleGroupUpdate } from './handlers/groups.js';
import { handleReputationDeliver, handleReputationGossip, handleReputationRequest } from './handlers/reputation.js';
import { handleSyncPulse } from './handlers/sync.js';
import { handleVaultDelivery } from './handlers/vault.js';

const vaultQueryThrottle = new Map<string, number>();

function maybeQueryVaultsForPeer(upeerId: string) {
    const last = vaultQueryThrottle.get(upeerId) ?? 0;
    if (Date.now() - last < 30_000) return;
    vaultQueryThrottle.set(upeerId, Date.now());
    import('./vault/manager.js').then(({ VaultManager }) => VaultManager.queryOwnVaults()).catch((err) => {
        warn('Failed to query own vaults for peer activity', err, 'vault');
    });
}

async function handlePingProfileUpdate(upeerId: string, contact: any, data: any) {
    if (data.alias && typeof data.alias === 'string') {
        import('../storage/contacts/operations.js').then(({ updateContactName }) => {
            updateContactName?.(upeerId, (data.alias as string).slice(0, 100));
        }).catch((err) => warn('Failed to update contact name', err, 'network'));
    }
    if (data.avatar && typeof data.avatar === 'string' && data.avatar.startsWith('data:image/') && data.avatar.length <= 2_000_000) {
        import('../storage/contacts/operations.js').then(({ updateContactAvatar }) => {
            updateContactAvatar?.(upeerId, data.avatar);
        }).catch((err) => warn('Failed to update contact avatar', err, 'network'));
    }
    if (data.signedPreKey && typeof data.signedPreKey === 'object') {
        const { spkPub, spkSig, spkId: newSpkId } = data.signedPreKey;
        if (typeof spkPub === 'string' && typeof spkSig === 'string' && typeof newSpkId === 'number') {
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
}

export async function routeVerifiedPacket(args: {
    upeerId: string;
    contact: any;
    data: any;
    signature: string;
    rinfo: { address: string; port: number };
    win: BrowserWindow | null;
    sendResponse: (ip: string, data: any) => void;
}): Promise<void> {
    const { upeerId, contact, data, signature, rinfo, win, sendResponse } = args;

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
            await (await import('./vault/protocol/handlers.js')).handleVaultStore(upeerId, data, rinfo.address, sendResponse);
            break;
        case 'VAULT_QUERY':
            await (await import('./vault/protocol/handlers.js')).handleVaultQuery(upeerId, data, rinfo.address, sendResponse);
            break;
        case 'VAULT_ACK':
            await (await import('./vault/protocol/handlers.js')).handleVaultAck(upeerId, data);
            break;
        case 'VAULT_DELIVERY':
            await handleVaultDelivery(upeerId, data, win, sendResponse, rinfo.address);
            break;
        case 'VAULT_RENEW':
            await (await import('./vault/protocol/handlers.js')).handleVaultRenew(upeerId, data);
            break;
        case 'CHAT':
            handleChatMessage(upeerId, contact, data, win, signature, rinfo.address, sendResponse);
            break;
        case 'ACK':
            handleChatAck(upeerId, data, win);
            break;
        case 'READ':
            handleChatAck(upeerId, { ...data, status: 'read' }, win);
            break;
        case 'TYPING':
            win?.webContents.send('peer-typing', { upeerId: upeerId });
            break;
        case 'CHAT_CONTACT':
            break;
        case 'CHAT_REACTION':
            handleChatReaction(upeerId, data, win);
            break;
        case 'CHAT_UPDATE':
            handleChatEdit(upeerId, data, win, signature);
            break;
        case 'CHAT_DELETE':
            handleChatDelete(upeerId, data, win);
            break;
        case 'CHAT_CLEAR_ALL':
            handleChatClear(upeerId, data, win);
            break;
        case 'IDENTITY_UPDATE':
            if (upeerId === getMyUPeerId()) {
                if (data.alias) setMyAlias(data.alias);
                if (data.avatar) setMyAvatar(data.avatar);
                win?.webContents.send('identity-updated', { alias: data.alias, avatar: data.avatar });
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
            handleGroupMessage(upeerId, contact, data, win, rinfo.address);
            break;
        case 'GROUP_ACK':
            handleGroupAck(upeerId, data, win);
            break;
        case 'GROUP_INVITE':
            handleGroupInvite(upeerId, data, win);
            break;
        case 'GROUP_UPDATE':
            handleGroupUpdate(upeerId, data, win);
            break;
        case 'GROUP_LEAVE':
            handleGroupLeave(upeerId, data, win);
            break;
        case 'SYNC_PULSE':
            await handleSyncPulse(upeerId, data, win);
            break;
        case 'REPUTATION_GOSSIP':
            handleReputationGossip(upeerId, data, sendResponse, rinfo);
            break;
        case 'REPUTATION_REQUEST':
            handleReputationRequest(upeerId, data, sendResponse, rinfo);
            break;
        case 'REPUTATION_DELIVER':
            handleReputationDeliver(upeerId, data);
            break;
        case 'DR_RESET': {
            const { deleteRatchetSession } = await import('../storage/ratchet/operations.js');
            deleteRatchetSession(upeerId);
            if (data.signedPreKey && typeof data.signedPreKey === 'object') {
                const { spkPub, spkSig, spkId: newSpkId } = data.signedPreKey;
                if (typeof spkPub === 'string' && typeof spkSig === 'string' && typeof newSpkId === 'number') {
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
            }
            info('DR session reset by peer', { upeerId }, 'security');
            break;
        }
        default:
            warn('Unknown packet', { upeerId, type: data.type, ip: rinfo.address }, 'network');
    }
}
