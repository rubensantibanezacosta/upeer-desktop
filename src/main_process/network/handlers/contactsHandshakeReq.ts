import { BrowserWindow } from 'electron';
import {
    getContactByUpeerId,
    addOrUpdateContact,
    isContactBlocked,
    updateContactAvatar,
} from '../../storage/contacts/operations.js';
import { AdaptivePow } from '../../security/pow.js';
import { issueVouch, VouchType, computeScore } from '../../security/reputation/vouches.js';
import { network, security, error, warn } from '../../security/secure-logger.js';
import { runTransaction } from '../../storage/shared.js';
import { computeKeyFingerprint } from '../../storage/contacts/keys.js';
import {
    getSafeEphemeralPublicKey,
    hasValidHandshakeIdentity,
    maybeSendAvatarUpdate,
    maybeUpdateSignedPreKey,
    rateLimiter,
    verifyHandshakeRequestSignature,
} from './contactsShared.js';

type ContactStatus = 'pending' | 'incoming' | 'connected' | 'offline' | 'blocked';

type ExistingContact = {
    upeerId: string;
    status?: ContactStatus;
    publicKey?: string;
    name?: string;
};

type HandshakeSignedPreKey = {
    spkPub?: unknown;
    spkSig?: unknown;
    spkId?: unknown;
};

type HandshakeRequestPayload = {
    publicKey?: string;
    type?: string;
    powProof?: unknown;
    alias?: unknown;
    avatar?: unknown;
    ephemeralPublicKey?: unknown;
    signedPreKey?: HandshakeSignedPreKey | unknown;
    addresses?: string[];
};

type ContactListItem = {
    upeerId?: string;
    status?: ContactStatus | string;
};

type HandshakeSendResponse = (ip: string, data: Record<string, unknown>) => void;

async function getContactsSafeList(): Promise<ContactListItem[]> {
    const contactsModule = await import('../../storage/contacts/operations.js').catch(() => ({ getContacts: () => [] as ContactListItem[] }));
    const contacts = contactsModule.getContacts();
    return Array.isArray(contacts) ? contacts as ContactListItem[] : [];
}

export async function handleHandshakeReq(
    data: HandshakeRequestPayload,
    signature: string,
    senderUpeerId: string,
    senderYggAddress: string,
    rinfo: { address: string; port: number },
    win: BrowserWindow | null,
    _sendResponse: HandshakeSendResponse,
    _tcpSourceAddress: string
): Promise<void> {
    if (!signature || !senderUpeerId || !data.publicKey) {
        security('HANDSHAKE_REQ missing required fields', { ip: rinfo.address }, 'network');
        return;
    }

    const publicKey = data.publicKey;
    const packetType = typeof data.type === 'string' ? data.type : 'HANDSHAKE_REQ';
    const verifiedData = { ...data, publicKey };

    if (!verifyHandshakeRequestSignature(verifiedData, signature, senderUpeerId, senderYggAddress)) {
        security('Invalid HANDSHAKE_REQ signature', { ip: rinfo.address }, 'network');
        return;
    }

    if (!hasValidHandshakeIdentity(verifiedData, senderUpeerId, rinfo.address, 'HANDSHAKE_REQ')) {
        return;
    }

    network('Handshake request verified', rinfo.address, { upeerId: senderUpeerId }, 'handshake');

    if (isContactBlocked(senderUpeerId)) {
        security('Blocked contact attempted handshake', { upeerId: senderUpeerId, ip: rinfo.address }, 'network');
        return;
    }

    if (!rateLimiter.checkIdentity(rinfo.address, senderUpeerId, packetType)) {
        return;
    }

    const existingContact = await getContactByUpeerId(senderUpeerId) as ExistingContact | undefined;
    const isNewContact = !existingContact;
    if (isNewContact) {
        const powProof = data.powProof;
        if (typeof powProof !== 'string' || !powProof) {
            security('New contact requires PoW proof', { upeerId: senderUpeerId, ip: rinfo.address }, 'pow');
            return;
        }
        if (!AdaptivePow.verifyLightProof(powProof, senderUpeerId)) {
            security('Invalid PoW proof from new contact', { upeerId: senderUpeerId, ip: rinfo.address }, 'pow');
            return;
        }
        security('PoW verified for new contact', { upeerId: senderUpeerId, ip: rinfo.address }, 'pow');
    }

    issueVouch(senderUpeerId, VouchType.HANDSHAKE).catch((err) => warn('Failed to issue vouch for handshake', err, 'reputation'));

    const contacts = await getContactsSafeList();
    const directIds = new Set<string>(
        contacts
            .filter((contact) => (contact.status === 'connected' || contact.status === 'offline') && typeof contact.upeerId === 'string')
            .map((contact) => contact.upeerId as string)
    );
    const vouchScore = computeScore(senderUpeerId, directIds);
    if (vouchScore < 40) {
        security('Low vouch score contact detected', { upeerId: senderUpeerId, score: vouchScore, ip: rinfo.address }, 'reputation');
        win?.webContents.send('contact-untrustworthy', {
            upeerId: senderUpeerId,
            address: rinfo.address,
            alias: data.alias,
            reason: 'low_reputation',
        });
    }

    if (existingContact?.status === 'blocked') {
        security('Rejected handshake from blocked contact', { upeerId: senderUpeerId, ip: rinfo.address }, 'security');
        return;
    }

    const isAlreadyConnected = existingContact?.status === 'connected';
    const isPendingByUs = existingContact?.status === 'pending';
    const newStatus = (isAlreadyConnected || isPendingByUs) ? 'connected' : 'incoming';
    const rawAlias = typeof data.alias === 'string' ? data.alias.slice(0, 100) : null;
    const alias = rawAlias || existingContact?.name || `Peer ${senderUpeerId.slice(0, 4)}`;

    if (isAlreadyConnected && existingContact?.publicKey && existingContact.publicKey !== publicKey) {
        win?.webContents.send('key-change-alert', {
            upeerId: senderUpeerId,
            oldFingerprint: computeKeyFingerprint(existingContact.publicKey),
            newFingerprint: computeKeyFingerprint(publicKey),
            alias,
        });
        security('TOFU: static public key changed on re-handshake!', { upeerId: senderUpeerId, ip: rinfo.address }, 'security');
    }

    const safeEphKey = getSafeEphemeralPublicKey(data.ephemeralPublicKey);

    try {
        runTransaction(() => {
            addOrUpdateContact(senderUpeerId, rinfo.address, alias, publicKey, newStatus, safeEphKey, undefined, undefined, undefined, data.addresses);
            maybeUpdateSignedPreKey(senderUpeerId, publicKey, data.signedPreKey, 'HANDSHAKE_REQ');
            maybeSendAvatarUpdate(senderUpeerId, data.avatar, updateContactAvatar);
        });
    } catch (err) {
        error('Transaction failed in handshake request', err, 'db');
        return;
    }

    if (isAlreadyConnected || isPendingByUs) {
        win?.webContents.send('contact-presence', { upeerId: senderUpeerId, lastSeen: new Date().toISOString() });
        import('../messaging/contacts.js').then(({ acceptContactRequest }) => {
            acceptContactRequest(senderUpeerId, publicKey);
        }).catch(err => error('Failed to auto-accept known contact', err, 'network'));
        return;
    }

    win?.webContents.send('contact-request-received', {
        upeerId: senderUpeerId,
        address: rinfo.address,
        alias: data.alias,
        avatar: data.avatar || undefined,
        publicKey,
        ephemeralPublicKey: data.ephemeralPublicKey,
        vouchScore,
    });
}
