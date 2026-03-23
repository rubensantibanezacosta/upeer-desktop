import { BrowserWindow } from 'electron';
import {
    getContactByUpeerId,
    addOrUpdateContact,
    deleteContact,
    isContactBlocked,
    getContactByAddress,
    updateContactName,
    updateContactAvatar,
} from '../../storage/contacts/operations.js';
import {
    updateContactPublicKey,
    updateContactEphemeralPublicKey,
} from '../../storage/contacts/keys.js';
import {
    verify,
    getUPeerIdFromPublicKey,
} from '../../security/identity.js';
import { AdaptivePow } from '../../security/pow.js';
import { canonicalStringify } from '../utils.js';
import { issueVouch, VouchType, computeScore } from '../../security/reputation/vouches.js';
import { network, security, error, warn } from '../../security/secure-logger.js';
import { runTransaction } from '../../storage/shared.js';
import { computeKeyFingerprint, updateContactSignedPreKey } from '../../storage/contacts/keys.js';
import { flushPendingOutbox } from '../../storage/pending-outbox.js';
import { IdentityRateLimiter } from '../../security/identity-rate-limiter.js';

const rateLimiter = new IdentityRateLimiter();

export async function handleHandshakeReq(
    data: any,
    signature: string,
    senderUpeerId: string,
    senderYggAddress: string,
    rinfo: { address: string; port: number },
    win: BrowserWindow | null,
    _sendResponse: (ip: string, data: any) => void,
    _tcpSourceAddress: string
): Promise<void> {
    if (!signature || !senderUpeerId || !data.publicKey) {
        security('HANDSHAKE_REQ missing required fields', { ip: rinfo.address }, 'network');
        return;
    }

    const fieldsToExclude = ['contactCache', 'renewalToken'];
    const dataForVerification = { ...data };
    fieldsToExclude.forEach(field => {
        if (field in dataForVerification) {
            delete dataForVerification[field];
        }
    });
    const payloadForVerification = { ...dataForVerification, senderUpeerId, senderYggAddress };
    const isValidSignature = verify(
        Buffer.from(canonicalStringify(payloadForVerification)),
        Buffer.from(signature, 'hex'),
        Buffer.from(data.publicKey, 'hex')
    );

    if (!isValidSignature) {
        const legacyPayload = { ...dataForVerification, senderUpeerId };
        const legacyValid = verify(
            Buffer.from(canonicalStringify(legacyPayload)),
            Buffer.from(signature, 'hex'),
            Buffer.from(data.publicKey, 'hex')
        );
        if (!legacyValid) {
            security('Invalid HANDSHAKE_REQ signature', { ip: rinfo.address }, 'network');
            return;
        }
    }

    const derivedId = getUPeerIdFromPublicKey(Buffer.from(data.publicKey, 'hex'));
    if (derivedId !== senderUpeerId) {
        security('HANDSHAKE_REQ ID mismatch', { ip: rinfo.address, expected: derivedId, received: senderUpeerId }, 'network');
        return;
    }

    network('Handshake request verified', rinfo.address, { upeerId: senderUpeerId }, 'handshake');

    if (isContactBlocked(senderUpeerId)) {
        security('Blocked contact attempted handshake', { upeerId: senderUpeerId, ip: rinfo.address }, 'network');
        return;
    }

    if (!rateLimiter.checkIdentity(rinfo.address, senderUpeerId, data.type)) {
        return;
    }

    const existingContact = await getContactByUpeerId(senderUpeerId);
    const isNewContact = !existingContact;

    if (isNewContact) {
        if (!data.powProof) {
            security('New contact requires PoW proof', { upeerId: senderUpeerId, ip: rinfo.address }, 'pow');
            return;
        }
        if (!AdaptivePow.verifyLightProof(data.powProof, senderUpeerId)) {
            security('Invalid PoW proof from new contact', { upeerId: senderUpeerId, ip: rinfo.address }, 'pow');
            return;
        }
        security('PoW verified for new contact', { upeerId: senderUpeerId, ip: rinfo.address }, 'pow');
    }

    issueVouch(senderUpeerId, VouchType.HANDSHAKE).catch((err) => warn('Failed to issue vouch for handshake', err, 'reputation'));

    const { getContacts: _gc } = await import('../../storage/contacts/operations.js').catch(() => ({ getContacts: () => [] })) as any;
    const _contacts = _gc() as any[];
    const _directIds = new Set<string>(_contacts.filter((c: any) => (c.status === 'connected' || c.status === 'offline') && c.upeerId).map((c: any) => c.upeerId as string));
    const vouchScore = computeScore(senderUpeerId, _directIds);
    if (vouchScore < 40) {
        security('Low vouch score contact detected', { upeerId: senderUpeerId, score: vouchScore, ip: rinfo.address }, 'reputation');
        win?.webContents.send('contact-untrustworthy', {
            upeerId: senderUpeerId,
            address: rinfo.address,
            alias: data.alias,
            reason: 'low_reputation'
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

    if (isAlreadyConnected && existingContact?.publicKey && existingContact.publicKey !== data.publicKey) {
        win?.webContents.send('key-change-alert', {
            upeerId: senderUpeerId,
            oldFingerprint: computeKeyFingerprint(existingContact.publicKey),
            newFingerprint: computeKeyFingerprint(data.publicKey),
            alias: alias,
        });
        security('TOFU: static public key changed on re-handshake!', { upeerId: senderUpeerId, ip: rinfo.address }, 'security');
    }

    const safeEphKey = typeof data.ephemeralPublicKey === 'string' && /^[0-9a-f]{64}$/i.test(data.ephemeralPublicKey)
        ? data.ephemeralPublicKey : undefined;

    try {
        runTransaction(() => {
            addOrUpdateContact(senderUpeerId, rinfo.address, alias, data.publicKey, newStatus, safeEphKey, undefined, undefined, undefined, data.addresses);

            if (data.signedPreKey && typeof data.signedPreKey === 'object') {
                const { spkPub, spkSig, spkId } = data.signedPreKey;
                if (typeof spkPub === 'string' && typeof spkSig === 'string' && typeof spkId === 'number') {
                    try {
                        const spkValid = verify(
                            Buffer.from(spkPub, 'hex'),
                            Buffer.from(spkSig, 'hex'),
                            Buffer.from(data.publicKey, 'hex')
                        );
                        if (spkValid) {
                            updateContactSignedPreKey(senderUpeerId, spkPub, spkSig, spkId);
                        } else {
                            security('HANDSHAKE_REQ: firma SPK inválida', { upeerId: senderUpeerId }, 'security');
                        }
                    } catch (err) { warn('Error in SPK verification', err, 'security'); }
                }
            }

            if (data.avatar && typeof data.avatar === 'string' && data.avatar.startsWith('data:image/') && data.avatar.length <= 2_000_000) {
                updateContactAvatar(senderUpeerId, data.avatar);
            }
        });
    } catch (err) {
        error('Transaction failed in handshake request', err, 'db');
        return;
    }

    if (isAlreadyConnected || isPendingByUs) {
        win?.webContents.send('contact-presence', { upeerId: senderUpeerId, lastSeen: new Date().toISOString() });

        import('../messaging/contacts.js').then(({ acceptContactRequest }) => {
            acceptContactRequest(senderUpeerId, data.publicKey);
        }).catch(err => error('Failed to auto-accept known contact', err, 'network'));
        return;
    }

    win?.webContents.send('contact-request-received', {
        upeerId: senderUpeerId,
        address: rinfo.address,
        alias: data.alias,
        avatar: data.avatar || undefined,
        publicKey: data.publicKey,
        ephemeralPublicKey: data.ephemeralPublicKey,
        vouchScore,
    });
}

export async function handleHandshakeAccept(
    data: any,
    signature: string,
    senderUpeerId: string,
    senderYggAddress: string,
    rinfo: { address: string; port: number },
    win: BrowserWindow | null,
    _sendResponse: (ip: string, data: any) => void,
    _tcpSourceAddress: string
): Promise<void> {
    if (!signature || !senderUpeerId || !data.publicKey) {
        security('HANDSHAKE_ACCEPT missing required fields', { ip: rinfo.address }, 'network');
        return;
    }

    const acceptPayload = { ...data, senderUpeerId, senderYggAddress };
    let isValidAcceptSignature = verify(
        Buffer.from(canonicalStringify(acceptPayload)),
        Buffer.from(signature, 'hex'),
        Buffer.from(data.publicKey, 'hex')
    );
    if (!isValidAcceptSignature) {
        const legacyAcceptPayload = { ...data, senderUpeerId };
        isValidAcceptSignature = verify(
            Buffer.from(canonicalStringify(legacyAcceptPayload)),
            Buffer.from(signature, 'hex'),
            Buffer.from(data.publicKey, 'hex')
        );
    }
    if (!isValidAcceptSignature) {
        isValidAcceptSignature = verify(
            Buffer.from(canonicalStringify(data)),
            Buffer.from(signature, 'hex'),
            Buffer.from(data.publicKey, 'hex')
        );
    }

    if (!isValidAcceptSignature) {
        security('Invalid HANDSHAKE_ACCEPT signature', { ip: rinfo.address }, 'network');
        return;
    }

    const derivedId = getUPeerIdFromPublicKey(Buffer.from(data.publicKey, 'hex'));
    if (derivedId !== senderUpeerId) {
        security('HANDSHAKE_ACCEPT ID mismatch', { ip: rinfo.address, expected: derivedId, received: senderUpeerId }, 'network');
        return;
    }

    network('Handshake accepted verified', rinfo.address, { upeerId: senderUpeerId }, 'handshake');

    if (!rateLimiter.checkIdentity(rinfo.address, senderUpeerId, data.type)) {
        return;
    }

    const ghost = await getContactByAddress(rinfo.address);
    if (ghost && ghost.upeerId.startsWith('pending-')) {
        deleteContact(ghost.upeerId);
    }

    const existing = await getContactByUpeerId(senderUpeerId);

    if (existing && existing.status === 'connected') {
        const currentAddress = rinfo.address;
        const incomingAddresses = Array.isArray(data.addresses) ? data.addresses : [currentAddress];
        addOrUpdateContact(senderUpeerId, currentAddress, existing.name, data.publicKey, 'connected', data.ephemeralPublicKey, undefined, undefined, undefined, incomingAddresses);
        if (data.ephemeralPublicKey && typeof data.ephemeralPublicKey === 'string' && /^[0-9a-f]{64}$/i.test(data.ephemeralPublicKey)) {
            updateContactEphemeralPublicKey(senderUpeerId, data.ephemeralPublicKey);
        }
        import('../vault/manager.js').then(({ VaultManager }) => {
            VaultManager.queryOwnVaults();
        }).catch(() => { });
        return;
    }

    if (existing && existing.status === 'pending') {
        let keyResult: { changed: boolean; oldKey?: string; newKey: string };
        try {
            keyResult = runTransaction<{ changed: boolean; oldKey?: string; newKey: string }>(() => {
                const result = updateContactPublicKey(senderUpeerId, data.publicKey);

                if (data.ephemeralPublicKey && typeof data.ephemeralPublicKey === 'string' && /^[0-9a-f]{64}$/i.test(data.ephemeralPublicKey)) {
                    updateContactEphemeralPublicKey(senderUpeerId, data.ephemeralPublicKey);
                }

                if (data.signedPreKey && typeof data.signedPreKey === 'object') {
                    const { spkPub, spkSig, spkId } = data.signedPreKey;
                    if (typeof spkPub === 'string' && typeof spkSig === 'string' && typeof spkId === 'number') {
                        try {
                            const spkValid = verify(
                                Buffer.from(spkPub, 'hex'),
                                Buffer.from(spkSig, 'hex'),
                                Buffer.from(data.publicKey, 'hex')
                            );
                            if (spkValid) {
                                updateContactSignedPreKey(senderUpeerId, spkPub, spkSig, spkId);
                            } else {
                                security('HANDSHAKE_ACCEPT: firma SPK inválida', { upeerId: senderUpeerId }, 'security');
                            }
                        } catch (err) {
                            warn('Error verificando signed prekey', err, 'security');
                        }
                    }
                }

                if (data.alias && typeof data.alias === 'string') {
                    updateContactName(senderUpeerId, (data.alias as string).slice(0, 100));
                }

                const currentAddress = rinfo.address;
                const incomingAddresses = Array.isArray(data.addresses) ? data.addresses : [currentAddress];

                addOrUpdateContact(senderUpeerId, currentAddress, data.alias || existing.name, data.publicKey, 'connected', data.ephemeralPublicKey, undefined, undefined, undefined, incomingAddresses);

                if (data.avatar && typeof data.avatar === 'string' && data.avatar.startsWith('data:image/') && data.avatar.length <= 2_000_000) {
                    updateContactAvatar(senderUpeerId, data.avatar);
                }

                return result;
            });
        } catch (err) {
            error('Transaction failed in handshake accept', err, 'db');
            return;
        }

        const kr = keyResult;
        if (kr.changed && kr.oldKey) {
            win?.webContents.send('key-change-alert', {
                upeerId: senderUpeerId,
                oldFingerprint: computeKeyFingerprint(kr.oldKey),
                newFingerprint: computeKeyFingerprint(kr.newKey),
                alias: data.alias || existing.name,
            });
        }

        if (data.publicKey) {
            flushPendingOutbox(senderUpeerId, data.publicKey).catch((err) =>
                warn('Failed to flush pending outbox', err, 'storage')
            );
        }

        import('../vault/manager.js').then(({ VaultManager }) => {
            VaultManager.queryOwnVaults();
        }).catch(() => { });

        win?.webContents.send('contact-handshake-finished', { upeerId: senderUpeerId });
    }
}
