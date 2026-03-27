import {
    isValidHexId,
    validatePowProof,
    validateSignedPreKey,
    type ValidationResult,
} from './validationShared.js';

type SignedPreKeyPayload = {
    spkPub?: unknown;
    spkSig?: unknown;
    spkId?: unknown;
};

type HandshakePayload = {
    publicKey?: unknown;
    ephemeralPublicKey?: unknown;
    alias?: unknown;
    avatar?: unknown;
    powProof?: unknown;
    signedPreKey?: SignedPreKeyPayload | unknown;
};

type X3dhInitPayload = {
    ikPub?: unknown;
    ekPub?: unknown;
    spkId?: unknown;
};

type RatchetHeaderPayload = {
    dh?: unknown;
    pn?: unknown;
    n?: unknown;
};

type ChatPayload = {
    id?: unknown;
    content?: unknown;
    nonce?: unknown;
    ephemeralPublicKey?: unknown;
    replyTo?: unknown;
    x3dhInit?: X3dhInitPayload | unknown;
    ratchetHeader?: RatchetHeaderPayload | unknown;
};

type AckPayload = {
    id?: unknown;
};

type PingPayload = {
    ephemeralPublicKey?: unknown;
    avatar?: unknown;
    alias?: unknown;
    signedPreKey?: SignedPreKeyPayload | unknown;
};

type ChatReactionPayload = {
    msgId?: unknown;
    emoji?: unknown;
    remove?: unknown;
};

type ChatUpdatePayload = {
    msgId?: unknown;
    content?: unknown;
    nonce?: unknown;
    ephemeralPublicKey?: unknown;
};

type ChatDeletePayload = {
    msgId?: unknown;
    signature?: unknown;
};

type ChatClearPayload = {
    chatUpeerId?: unknown;
    timestamp?: unknown;
    signature?: unknown;
};

type ChatContactPayload = {
    id?: unknown;
    upeerId?: unknown;
    contactName?: unknown;
    contactAddress?: unknown;
    contactPublicKey?: unknown;
    contactAvatar?: unknown;
};

type IdentityUpdatePayload = {
    alias?: unknown;
    avatar?: unknown;
};

type SyncResetPayload = {
    signedPreKey?: SignedPreKeyPayload | unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isX3dhInitPayload(value: unknown): value is X3dhInitPayload {
    return isRecord(value);
}

function isRatchetHeaderPayload(value: unknown): value is RatchetHeaderPayload {
    return isRecord(value);
}

function validatePublicKey(value: unknown, fieldName: string): ValidationResult {
    if (!value || typeof value !== 'string' || value.length !== 64) {
        return { valid: false, error: `Invalid ${fieldName}` };
    }
    return { valid: true };
}

function validateOptionalPublicKey(value: unknown, fieldName: string): ValidationResult {
    if (value !== undefined && (typeof value !== 'string' || value.length !== 64)) {
        return { valid: false, error: `Invalid ${fieldName}` };
    }
    return { valid: true };
}

function validateAvatar(value: unknown, errorMessage: string): ValidationResult {
    if (value !== undefined && (typeof value !== 'string' || value.length > 307200)) {
        return { valid: false, error: errorMessage };
    }
    return { valid: true };
}

export function validateHandshakeReq(data: HandshakePayload): ValidationResult {
    const publicKey = validatePublicKey(data.publicKey, 'publicKey');
    if (!publicKey.valid) return publicKey;

    const ephemeralPublicKey = validateOptionalPublicKey(data.ephemeralPublicKey, 'ephemeralPublicKey');
    if (!ephemeralPublicKey.valid) return ephemeralPublicKey;

    if (data.alias !== undefined && typeof data.alias !== 'string') {
        return { valid: false, error: 'Invalid alias' };
    }
    if (typeof data.alias === 'string' && data.alias.length > 100) {
        return { valid: false, error: 'Alias too long' };
    }

    const avatar = validateAvatar(data.avatar, 'Avatar too large or invalid');
    if (!avatar.valid) return avatar;

    if (data.powProof !== undefined) {
        const powProof = validatePowProof(data.powProof);
        if (!powProof.valid) return powProof;
    }

    const signedPreKey = validateSignedPreKey(data.signedPreKey, '(expected 64 hex chars)');
    if (!signedPreKey.valid) {
        if (signedPreKey.error?.startsWith('Invalid signedPreKey.spkSig')) {
            return { valid: false, error: 'Invalid signedPreKey.spkSig (expected 128 hex chars)' };
        }
        if (signedPreKey.error?.startsWith('Invalid signedPreKey.spkPub')) {
            return { valid: false, error: 'Invalid signedPreKey.spkPub (expected 64 hex chars)' };
        }
        return signedPreKey;
    }

    return { valid: true };
}

export function validateHandshakeAccept(data: HandshakePayload): ValidationResult {
    const publicKey = validatePublicKey(data.publicKey, 'publicKey');
    if (!publicKey.valid) return publicKey;

    const ephemeralPublicKey = validateOptionalPublicKey(data.ephemeralPublicKey, 'ephemeralPublicKey');
    if (!ephemeralPublicKey.valid) return ephemeralPublicKey;

    const avatar = validateAvatar(data.avatar, 'Avatar too large or invalid');
    if (!avatar.valid) return avatar;

    if (data.alias !== undefined && (typeof data.alias !== 'string' || data.alias.length > 100)) {
        return { valid: false, error: 'Alias too long or invalid in HANDSHAKE_ACCEPT' };
    }

    const signedPreKey = validateSignedPreKey(data.signedPreKey, '(expected 64 hex chars)');
    if (!signedPreKey.valid) {
        if (signedPreKey.error?.startsWith('Invalid signedPreKey.spkSig')) {
            return { valid: false, error: 'Invalid signedPreKey.spkSig (expected 128 hex chars)' };
        }
        if (signedPreKey.error?.startsWith('Invalid signedPreKey.spkPub')) {
            return { valid: false, error: 'Invalid signedPreKey.spkPub (expected 64 hex chars)' };
        }
        return signedPreKey;
    }

    return { valid: true };
}

export function validateChat(data: ChatPayload): ValidationResult {
    if (!data.id || typeof data.id !== 'string' || data.id.length > 100) {
        return { valid: false, error: 'Invalid message id' };
    }
    if (!data.content || typeof data.content !== 'string') {
        return { valid: false, error: 'Invalid content' };
    }
    if (data.content.length > 200_000) {
        return { valid: false, error: 'Content too long' };
    }
    if ((data.ratchetHeader || data.nonce) && data.content.length < 32) {
        return { valid: false, error: 'Ciphertext too short (min 32 hex chars)' };
    }
    if (data.nonce && (typeof data.nonce !== 'string' || data.nonce.length !== 48)) {
        return { valid: false, error: 'Invalid nonce' };
    }
    const ephemeralPublicKey = validateOptionalPublicKey(data.ephemeralPublicKey, 'ephemeralPublicKey');
    if (!ephemeralPublicKey.valid) return ephemeralPublicKey;
    if (data.replyTo && (typeof data.replyTo !== 'string' || data.replyTo.length > 100)) {
        return { valid: false, error: 'Invalid replyTo' };
    }
    if (data.x3dhInit) {
        const x3dhInit = data.x3dhInit;
        if (!isX3dhInitPayload(x3dhInit)) {
            return { valid: false, error: 'x3dhInit must be an object' };
        }
        if (!x3dhInit.ikPub || typeof x3dhInit.ikPub !== 'string' || x3dhInit.ikPub.length !== 64) {
            return { valid: false, error: 'Invalid x3dhInit.ikPub' };
        }
        if (!x3dhInit.ekPub || typeof x3dhInit.ekPub !== 'string' || x3dhInit.ekPub.length !== 64) {
            return { valid: false, error: 'Invalid x3dhInit.ekPub' };
        }
        if (typeof x3dhInit.spkId !== 'number' || !Number.isInteger(x3dhInit.spkId) || x3dhInit.spkId < 0) {
            return { valid: false, error: 'Invalid x3dhInit.spkId' };
        }
    }
    if (data.ratchetHeader) {
        const ratchetHeader = data.ratchetHeader;
        if (!isRatchetHeaderPayload(ratchetHeader)) {
            return { valid: false, error: 'ratchetHeader must be an object' };
        }
        if (ratchetHeader.dh && (typeof ratchetHeader.dh !== 'string' || ratchetHeader.dh.length !== 64)) {
            return { valid: false, error: 'Invalid ratchetHeader.dh' };
        }
        if (ratchetHeader.pn !== undefined && (typeof ratchetHeader.pn !== 'number' || ratchetHeader.pn < 0 || ratchetHeader.pn > 1_000_000)) {
            return { valid: false, error: 'Invalid ratchetHeader.pn' };
        }
        if (ratchetHeader.n !== undefined && (typeof ratchetHeader.n !== 'number' || ratchetHeader.n < 0 || ratchetHeader.n > 1_000_000)) {
            return { valid: false, error: 'Invalid ratchetHeader.n' };
        }
    }
    return { valid: true };
}

export function validateAck(data: AckPayload): ValidationResult {
    if (!data.id || typeof data.id !== 'string' || data.id.length > 100) {
        return { valid: false, error: 'Invalid ack id' };
    }
    return { valid: true };
}

export function validateRead(data: AckPayload): ValidationResult {
    if (!data.id || typeof data.id !== 'string' || data.id.length > 100) {
        return { valid: false, error: 'Invalid read id' };
    }
    return { valid: true };
}

export function validateTyping(_data: unknown): ValidationResult {
    return { valid: true };
}

export function validatePingPong(data: PingPayload): ValidationResult {
    const ephemeralPublicKey = validateOptionalPublicKey(data.ephemeralPublicKey, 'ephemeralPublicKey in PING');
    if (!ephemeralPublicKey.valid) return ephemeralPublicKey;

    const avatar = validateAvatar(data.avatar, 'Avatar too large or invalid in PING');
    if (!avatar.valid) return avatar;

    if (data.alias !== undefined && (typeof data.alias !== 'string' || data.alias.length > 100)) {
        return { valid: false, error: 'Alias too long or invalid in PING' };
    }

    const signedPreKey = validateSignedPreKey(data.signedPreKey, ' in PING');
    if (!signedPreKey.valid) return signedPreKey;

    return { valid: true };
}

export function validateChatReaction(data: ChatReactionPayload): ValidationResult {
    if (!data.msgId || typeof data.msgId !== 'string' || data.msgId.length > 100) {
        return { valid: false, error: 'Invalid msgId' };
    }
    if (!data.emoji || typeof data.emoji !== 'string' || data.emoji.length > 10) {
        return { valid: false, error: 'Invalid emoji' };
    }
    if (typeof data.remove !== 'boolean') {
        return { valid: false, error: 'Invalid remove flag' };
    }
    return { valid: true };
}

export function validateChatUpdate(data: ChatUpdatePayload): ValidationResult {
    if (!data.msgId || typeof data.msgId !== 'string' || data.msgId.length > 100) {
        return { valid: false, error: 'Invalid msgId' };
    }
    if (!data.content || typeof data.content !== 'string') {
        return { valid: false, error: 'Invalid content' };
    }
    if (data.content.length > 200_000) {
        return { valid: false, error: 'Content too long' };
    }
    if (data.nonce && (typeof data.nonce !== 'string' || data.nonce.length !== 48)) {
        return { valid: false, error: 'Invalid nonce' };
    }
    const ephemeralPublicKey = validateOptionalPublicKey(data.ephemeralPublicKey, 'ephemeralPublicKey');
    if (!ephemeralPublicKey.valid) return ephemeralPublicKey;
    return { valid: true };
}

export function validateChatDelete(data: ChatDeletePayload): ValidationResult {
    if (!data.msgId || typeof data.msgId !== 'string' || data.msgId.length > 100) {
        return { valid: false, error: 'Invalid msgId' };
    }
    if (data.signature !== undefined && (typeof data.signature !== 'string' || data.signature.length !== 128)) {
        return { valid: false, error: 'Invalid signature (expected 128 hex chars)' };
    }
    return { valid: true };
}

export function validateChatClear(data: ChatClearPayload): ValidationResult {
    if (!isValidHexId(data.chatUpeerId)) {
        return { valid: false, error: 'Invalid chatUpeerId' };
    }
    if (data.timestamp !== undefined && (typeof data.timestamp !== 'number' || data.timestamp < 0)) {
        return { valid: false, error: 'Invalid timestamp' };
    }
    if (!data.signature || typeof data.signature !== 'string' || data.signature.length !== 128) {
        return { valid: false, error: 'Invalid or missing signature (expected 128 hex chars)' };
    }
    return { valid: true };
}

export function validateChatContact(data: ChatContactPayload): ValidationResult {
    if (!data.id || typeof data.id !== 'string' || data.id.length > 100) {
        return { valid: false, error: 'Invalid id' };
    }
    if (!isValidHexId(data.upeerId)) {
        return { valid: false, error: 'Invalid upeerId' };
    }
    if (data.contactName !== undefined && (typeof data.contactName !== 'string' || data.contactName.length > 100)) {
        return { valid: false, error: 'Invalid contactName' };
    }
    if (data.contactAddress !== undefined && typeof data.contactAddress !== 'string') {
        return { valid: false, error: 'Invalid contactAddress' };
    }
    if (!data.contactPublicKey || typeof data.contactPublicKey !== 'string' || data.contactPublicKey.length !== 64) {
        return { valid: false, error: 'Invalid contactPublicKey' };
    }
    if (data.contactAvatar !== undefined && (typeof data.contactAvatar !== 'string' || !data.contactAvatar.startsWith('data:image/') || data.contactAvatar.length > 2_000_000)) {
        return { valid: false, error: 'Invalid contactAvatar' };
    }
    return { valid: true };
}

export function validateIdentityUpdate(data: IdentityUpdatePayload): ValidationResult {
    if (data.alias !== undefined && (typeof data.alias !== 'string' || data.alias.length > 100)) {
        return { valid: false, error: 'Invalid alias' };
    }
    if (data.avatar !== undefined && (typeof data.avatar !== 'string' || !data.avatar.startsWith('data:image/') || data.avatar.length > 2_000_000)) {
        return { valid: false, error: 'Invalid avatar' };
    }
    return { valid: true };
}

export function validateDrReset(data: SyncResetPayload): ValidationResult {
    return validateSignedPreKey(data.signedPreKey);
}
