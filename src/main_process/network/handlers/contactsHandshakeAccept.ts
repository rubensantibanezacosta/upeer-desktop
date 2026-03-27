import { BrowserWindow } from 'electron';
import {
    getContactByUpeerId,
    deleteContact,
    getContactByAddress,
    updateContactName,
    updateContactAvatar,
    addOrUpdateContact,
} from '../../storage/contacts/operations.js';
import {
    updateContactPublicKey,
    updateContactEphemeralPublicKey,
    computeKeyFingerprint,
} from '../../storage/contacts/keys.js';
import { error, network, warn, security } from '../../security/secure-logger.js';
import { runTransaction } from '../../storage/shared.js';
import { flushPendingOutbox } from '../../storage/pending-outbox.js';
import {
    getSafeEphemeralPublicKey,
    hasValidHandshakeIdentity,
    maybeSendAvatarUpdate,
    maybeUpdateSignedPreKey,
    rateLimiter,
    verifyHandshakeAcceptSignature,
} from './contactsShared.js';

type ContactStatus = 'pending' | 'incoming' | 'connected' | 'offline' | 'blocked';

type ExistingContact = {
    upeerId: string;
    status?: ContactStatus;
    publicKey?: string;
    name: string;
};

type GhostContact = {
    upeerId: string;
};

type HandshakeSignedPreKey = {
    spkPub?: unknown;
    spkSig?: unknown;
    spkId?: unknown;
};

type HandshakeAcceptPayload = {
    publicKey?: string;
    type?: string;
    alias?: unknown;
    avatar?: unknown;
    ephemeralPublicKey?: unknown;
    signedPreKey?: HandshakeSignedPreKey | unknown;
    addresses?: string[];
};

type HandshakeSendResponse = (ip: string, data: Record<string, unknown>) => void;

function queryOwnVaultsAfterHandshake(senderUpeerId: string, label: string): void {
    import('../vault/manager.js').then(({ VaultManager }) => {
        VaultManager.queryOwnVaults();
    }).catch((err) => {
        warn(`Failed to query own vaults after ${label}`, { upeerId: senderUpeerId, err: String(err) }, 'vault');
    });
}

export async function handleHandshakeAccept(
    data: HandshakeAcceptPayload,
    signature: string,
    senderUpeerId: string,
    senderYggAddress: string,
    rinfo: { address: string; port: number },
    win: BrowserWindow | null,
    _sendResponse: HandshakeSendResponse,
    _tcpSourceAddress: string
): Promise<void> {
    if (!signature || !senderUpeerId || !data.publicKey) {
        security('HANDSHAKE_ACCEPT missing required fields', { ip: rinfo.address }, 'network');
        return;
    }

    const publicKey = data.publicKey;
    const packetType = typeof data.type === 'string' ? data.type : 'HANDSHAKE_ACCEPT';
    const safeEphKey = getSafeEphemeralPublicKey(data.ephemeralPublicKey);
    const verifiedData = { ...data, publicKey };

    if (!verifyHandshakeAcceptSignature(verifiedData, signature, senderUpeerId, senderYggAddress)) {
        security('Invalid HANDSHAKE_ACCEPT signature', { ip: rinfo.address }, 'network');
        return;
    }

    if (!hasValidHandshakeIdentity(verifiedData, senderUpeerId, rinfo.address, 'HANDSHAKE_ACCEPT')) {
        return;
    }

    network('Handshake accepted verified', rinfo.address, { upeerId: senderUpeerId }, 'handshake');

    if (!rateLimiter.checkIdentity(rinfo.address, senderUpeerId, packetType)) {
        return;
    }

    const ghost = await getContactByAddress(rinfo.address) as GhostContact | undefined;
    if (ghost && ghost.upeerId.startsWith('pending-')) {
        deleteContact(ghost.upeerId);
    }

    const existing = await getContactByUpeerId(senderUpeerId) as ExistingContact | undefined;
    if (existing && existing.status === 'connected') {
        const currentAddress = rinfo.address;
        const incomingAddresses = Array.isArray(data.addresses) ? data.addresses : [currentAddress];
        addOrUpdateContact(senderUpeerId, currentAddress, existing.name, publicKey, 'connected', safeEphKey, undefined, undefined, undefined, incomingAddresses);
        if (safeEphKey) {
            updateContactEphemeralPublicKey(senderUpeerId, safeEphKey);
        }
        queryOwnVaultsAfterHandshake(senderUpeerId, 'connected handshake accept');
        return;
    }

    if (!existing || existing.status !== 'pending') {
        return;
    }

    let keyResult: { changed: boolean; oldKey?: string; newKey: string };
    try {
        keyResult = runTransaction<{ changed: boolean; oldKey?: string; newKey: string }>(() => {
            const result = updateContactPublicKey(senderUpeerId, publicKey);
            if (safeEphKey) {
                updateContactEphemeralPublicKey(senderUpeerId, safeEphKey);
            }
            maybeUpdateSignedPreKey(senderUpeerId, publicKey, data.signedPreKey, 'HANDSHAKE_ACCEPT');
            if (typeof data.alias === 'string' && data.alias) {
                updateContactName(senderUpeerId, data.alias.slice(0, 100));
            }
            const currentAddress = rinfo.address;
            const incomingAddresses = Array.isArray(data.addresses) ? data.addresses : [currentAddress];
            addOrUpdateContact(
                senderUpeerId,
                currentAddress,
                typeof data.alias === 'string' && data.alias ? data.alias : existing.name,
                publicKey,
                'connected',
                safeEphKey,
                undefined,
                undefined,
                undefined,
                incomingAddresses
            );
            maybeSendAvatarUpdate(senderUpeerId, data.avatar, updateContactAvatar);
            return result;
        });
    } catch (err) {
        error('Transaction failed in handshake accept', err, 'db');
        return;
    }

    if (keyResult.changed && keyResult.oldKey) {
        win?.webContents.send('key-change-alert', {
            upeerId: senderUpeerId,
            oldFingerprint: computeKeyFingerprint(keyResult.oldKey),
            newFingerprint: computeKeyFingerprint(keyResult.newKey),
            alias: typeof data.alias === 'string' && data.alias ? data.alias : existing.name,
        });
    }

    flushPendingOutbox(senderUpeerId, publicKey).catch((err) =>
        warn('Failed to flush pending outbox', err, 'storage')
    );

    queryOwnVaultsAfterHandshake(senderUpeerId, 'pending handshake accept');
    win?.webContents.send('contact-handshake-finished', { upeerId: senderUpeerId });
}
