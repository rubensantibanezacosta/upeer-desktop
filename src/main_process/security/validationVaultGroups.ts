import {
    isValidHexId,
    type ValidationResult,
} from './validationShared.js';

type VaultStorePayload = {
    payloadHash?: unknown;
    recipientSid?: unknown;
    data?: unknown;
};

type VaultQueryPayload = {
    requesterSid?: unknown;
};

type VaultAckPayload = {
    payloadHashes?: unknown;
};

type VaultDeliveryEntry = {
    senderSid?: unknown;
    payloadHash?: unknown;
    data?: unknown;
};

type VaultDeliveryPayload = {
    entries?: unknown;
};

type VaultRenewPayload = {
    payloadHash?: unknown;
    newExpiresAt?: unknown;
};

type GroupMsgPayload = {
    groupId?: unknown;
    content?: unknown;
    nonce?: unknown;
    epoch?: unknown;
    id?: unknown;
    replyTo?: unknown;
};

type GroupAckPayload = {
    id?: unknown;
    groupId?: unknown;
};

type GroupPayload = {
    groupId?: unknown;
    payload?: unknown;
    nonce?: unknown;
    x3dhInit?: unknown;
    ratchetHeader?: unknown;
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

type GroupLeavePayload = {
    groupId?: unknown;
    signature?: unknown;
};

type ReputationIdsPayload = {
    ids?: unknown;
};

type ReputationMissingPayload = {
    missing?: unknown;
};

type ReputationVouch = {
    id?: unknown;
    fromId?: unknown;
    toId?: unknown;
    type?: unknown;
    timestamp?: unknown;
    signature?: unknown;
};

type ReputationDeliverPayload = {
    vouches?: unknown;
};

export function validateVaultStore(data: VaultStorePayload): ValidationResult {
    if (!data.payloadHash || typeof data.payloadHash !== 'string' || data.payloadHash.length < 1 || data.payloadHash.length > 200) {
        return { valid: false, error: 'Invalid payloadHash' };
    }
    if (!data.recipientSid || typeof data.recipientSid !== 'string' || data.recipientSid.length > 64) {
        return { valid: false, error: 'Invalid recipientSid' };
    }
    if (!data.data || typeof data.data !== 'string') {
        return { valid: false, error: 'Invalid data' };
    }
    if (data.data.length > 150_000) {
        return { valid: false, error: 'Vault data too large' };
    }
    return { valid: true };
}

export function validateVaultQuery(data: VaultQueryPayload): ValidationResult {
    if (!data.requesterSid || typeof data.requesterSid !== 'string' || data.requesterSid.length > 64) {
        return { valid: false, error: 'Invalid requesterSid' };
    }
    return { valid: true };
}

export function validateVaultAck(data: VaultAckPayload): ValidationResult {
    if (!Array.isArray(data.payloadHashes)) {
        return { valid: false, error: 'Invalid payloadHashes' };
    }
    if (data.payloadHashes.length > 200) {
        return { valid: false, error: 'Too many payloadHashes' };
    }
    for (const payloadHash of data.payloadHashes) {
        if (typeof payloadHash !== 'string' || payloadHash.length < 1 || payloadHash.length > 200) {
            return { valid: false, error: 'Invalid payloadHash in payloadHashes' };
        }
    }
    return { valid: true };
}

export function validateVaultDelivery(data: VaultDeliveryPayload): ValidationResult {
    if (!Array.isArray(data.entries)) {
        return { valid: false, error: 'Invalid entries' };
    }
    if (data.entries.length > 120) {
        return { valid: false, error: 'Too many vault entries' };
    }
    for (const entry of data.entries as VaultDeliveryEntry[]) {
        if (!entry || typeof entry !== 'object') {
            return { valid: false, error: 'Invalid vault entry' };
        }
        if (typeof entry.senderSid !== 'string' || entry.senderSid.length > 128) {
            return { valid: false, error: 'Invalid vault entry senderSid' };
        }
        if (typeof entry.payloadHash !== 'string' || entry.payloadHash.length < 1 || entry.payloadHash.length > 200) {
            return { valid: false, error: 'Invalid vault entry payloadHash' };
        }
        if (typeof entry.data !== 'string' || entry.data.length > 20_000_000) {
            return { valid: false, error: 'Invalid vault entry data' };
        }
    }
    return { valid: true };
}

export function validateVaultRenew(data: VaultRenewPayload): ValidationResult {
    if (!data.payloadHash || typeof data.payloadHash !== 'string' || data.payloadHash.length !== 64) {
        return { valid: false, error: 'Invalid payloadHash' };
    }
    if (typeof data.newExpiresAt !== 'number' || data.newExpiresAt < 0) {
        return { valid: false, error: 'Invalid newExpiresAt' };
    }
    return { valid: true };
}

export function validateGroupMsg(data: GroupMsgPayload): ValidationResult {
    if (!data.groupId || typeof data.groupId !== 'string' || data.groupId.length > 100) {
        return { valid: false, error: 'Invalid groupId' };
    }
    if (!data.content || typeof data.content !== 'string' || data.content.length > 200_000) {
        return { valid: false, error: 'Invalid or missing content' };
    }
    if (data.nonce !== undefined && (typeof data.nonce !== 'string' || data.nonce.length !== 48)) {
        return { valid: false, error: 'Invalid nonce' };
    }
    if (data.epoch !== undefined && (typeof data.epoch !== 'number' || !Number.isInteger(data.epoch) || data.epoch <= 0)) {
        return { valid: false, error: 'Invalid epoch' };
    }
    if (data.id !== undefined && (typeof data.id !== 'string' || data.id.length > 100)) {
        return { valid: false, error: 'Invalid message id' };
    }
    if (data.replyTo !== undefined && (typeof data.replyTo !== 'string' || data.replyTo.length > 100)) {
        return { valid: false, error: 'Invalid replyTo' };
    }
    return { valid: true };
}

export function validateGroupAck(data: GroupAckPayload): ValidationResult {
    if (!data.id || typeof data.id !== 'string' || data.id.length > 100) {
        return { valid: false, error: 'Invalid id' };
    }
    if (!data.groupId || typeof data.groupId !== 'string') {
        return { valid: false, error: 'Invalid groupId' };
    }
    return { valid: true };
}

function validateGroupPayload(data: GroupPayload, errorMessage: string): ValidationResult {
    if (!data.groupId || typeof data.groupId !== 'string' || data.groupId.length > 100) {
        return { valid: false, error: 'Invalid groupId' };
    }
    if (!data.payload || typeof data.payload !== 'string') {
        return { valid: false, error: 'Missing encrypted payload' };
    }
    if (data.payload.length > 500_000) {
        return { valid: false, error: errorMessage };
    }
    if (!data.nonce || typeof data.nonce !== 'string' || data.nonce.length !== 48) {
        return { valid: false, error: 'Invalid nonce' };
    }
    if (data.x3dhInit !== undefined) {
        if (!isRecord(data.x3dhInit)) {
            return { valid: false, error: 'x3dhInit must be an object' };
        }
        const x3dhInit = data.x3dhInit as X3dhInitPayload;
        if (typeof x3dhInit.ikPub !== 'string' || x3dhInit.ikPub.length !== 64) {
            return { valid: false, error: 'Invalid x3dhInit.ikPub' };
        }
        if (typeof x3dhInit.ekPub !== 'string' || x3dhInit.ekPub.length !== 64) {
            return { valid: false, error: 'Invalid x3dhInit.ekPub' };
        }
        if (typeof x3dhInit.spkId !== 'number' || !Number.isInteger(x3dhInit.spkId) || x3dhInit.spkId < 0) {
            return { valid: false, error: 'Invalid x3dhInit.spkId' };
        }
    }
    if (data.ratchetHeader !== undefined) {
        if (!isRecord(data.ratchetHeader)) {
            return { valid: false, error: 'ratchetHeader must be an object' };
        }
        const ratchetHeader = data.ratchetHeader as RatchetHeaderPayload;
        if (typeof ratchetHeader.dh !== 'string' || ratchetHeader.dh.length !== 64) {
            return { valid: false, error: 'Invalid ratchetHeader.dh' };
        }
        if (typeof ratchetHeader.pn !== 'number' || ratchetHeader.pn < 0 || ratchetHeader.pn > 1_000_000) {
            return { valid: false, error: 'Invalid ratchetHeader.pn' };
        }
        if (typeof ratchetHeader.n !== 'number' || ratchetHeader.n < 0 || ratchetHeader.n > 1_000_000) {
            return { valid: false, error: 'Invalid ratchetHeader.n' };
        }
    }
    return { valid: true };
}

export function validateGroupInvite(data: GroupPayload): ValidationResult {
    return validateGroupPayload(data, 'Group invite payload too large');
}

export function validateGroupUpdate(data: GroupPayload): ValidationResult {
    return validateGroupPayload(data, 'Group update payload too large');
}

export function validateGroupLeave(data: GroupLeavePayload): ValidationResult {
    if (!data.groupId || typeof data.groupId !== 'string' || data.groupId.length > 100) {
        return { valid: false, error: 'Invalid groupId' };
    }
    if (data.signature !== undefined && (typeof data.signature !== 'string' || data.signature.length !== 128)) {
        return { valid: false, error: 'Invalid signature (expected 128 hex chars)' };
    }
    return { valid: true };
}

export function validateReputationGossip(data: ReputationIdsPayload): ValidationResult {
    if (!Array.isArray(data.ids)) return { valid: false, error: 'ids debe ser un array' };
    if (data.ids.length > 500) return { valid: false, error: 'Demasiados IDs' };
    for (const id of data.ids) {
        if (!isValidHexId(id)) return { valid: false, error: 'ID de vouch inválido' };
    }
    return { valid: true };
}

export function validateReputationRequest(data: ReputationMissingPayload): ValidationResult {
    if (!Array.isArray(data.missing)) return { valid: false, error: 'missing debe ser un array' };
    if (data.missing.length > 100) return { valid: false, error: 'Demasiados IDs faltantes' };
    for (const id of data.missing) {
        if (!isValidHexId(id)) return { valid: false, error: 'ID de vouch inválido' };
    }
    return { valid: true };
}

export function validateReputationDeliver(data: ReputationDeliverPayload): ValidationResult {
    if (!Array.isArray(data.vouches)) return { valid: false, error: 'vouches debe ser un array' };
    if (data.vouches.length > 50) return { valid: false, error: 'Demasiados vouches' };
    for (const vouch of data.vouches as ReputationVouch[]) {
        if (!isValidHexId(vouch.id)) return { valid: false, error: 'id inválido' };
        if (!isValidHexId(vouch.fromId)) return { valid: false, error: 'fromId inválido' };
        if (!isValidHexId(vouch.toId)) return { valid: false, error: 'toId inválido' };
        if (!vouch.type || typeof vouch.type !== 'string') return { valid: false, error: 'type inválido' };
        if (typeof vouch.timestamp !== 'number') return { valid: false, error: 'timestamp inválido' };
        if (!vouch.signature || typeof vouch.signature !== 'string' || vouch.signature.length !== 128) {
            return { valid: false, error: 'signature inválida' };
        }
    }
    return { valid: true };
}
