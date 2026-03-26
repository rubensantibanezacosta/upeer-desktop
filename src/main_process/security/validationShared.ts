export interface ValidationResult {
    valid: boolean;
    error?: string;
}

const HEX_ID_RE = /^[0-9a-f]+$/i;
const POW_PROOF_RE = /^[0-9a-f]+$/i;
const KEY_40_OR_64_RE = /^[0-9a-f]+$/i;

export function isValidHexId(value: unknown): boolean {
    return typeof value === 'string' && value.length >= 32 && value.length <= 128 && HEX_ID_RE.test(value);
}

export function validatePowProof(value: unknown): ValidationResult {
    if (typeof value !== 'string' || value.length > 256) {
        return { valid: false, error: 'Invalid powProof (too long or wrong type)' };
    }
    if (!value.startsWith('{') && !POW_PROOF_RE.test(value)) {
        return { valid: false, error: 'Invalid powProof format' };
    }
    return { valid: true };
}

export function validateSignedPreKey(value: unknown, suffix = ''): ValidationResult {
    if (value === undefined || value === null) {
        return { valid: true };
    }

    if (typeof value !== 'object') {
        return { valid: false, error: `signedPreKey must be an object${suffix}`.trim() };
    }

    const signedPreKey = value as { spkPub?: unknown; spkSig?: unknown; spkId?: unknown };

    if (signedPreKey.spkPub !== undefined && (typeof signedPreKey.spkPub !== 'string' || signedPreKey.spkPub.length !== 64)) {
        return { valid: false, error: `Invalid signedPreKey.spkPub${suffix}`.trim() };
    }
    if (signedPreKey.spkSig !== undefined && (typeof signedPreKey.spkSig !== 'string' || signedPreKey.spkSig.length !== 128)) {
        return { valid: false, error: `Invalid signedPreKey.spkSig${suffix}`.trim() };
    }
    if (signedPreKey.spkId !== undefined && (typeof signedPreKey.spkId !== 'number' || !Number.isInteger(signedPreKey.spkId) || signedPreKey.spkId < 0)) {
        return { valid: false, error: `Invalid signedPreKey.spkId${suffix}`.trim() };
    }

    return { valid: true };
}

export function validateLocationBlock(locationBlock: unknown, required = true): ValidationResult {
    if (locationBlock === undefined) {
        return required ? { valid: false, error: 'Missing locationBlock' } : { valid: true };
    }
    if (typeof locationBlock !== 'object' || locationBlock === null) {
        return { valid: false, error: required ? 'Missing locationBlock' : 'Invalid locationBlock' };
    }

    const block = locationBlock as {
        address?: unknown;
        dhtSeq?: unknown;
        signature?: unknown;
        powProof?: unknown;
    };

    if (!block.address || typeof block.address !== 'string') {
        return { valid: false, error: 'Invalid locationBlock.address' };
    }
    if (typeof block.dhtSeq !== 'number' || block.dhtSeq < 0) {
        return { valid: false, error: 'Invalid locationBlock.dhtSeq' };
    }
    if (!block.signature || typeof block.signature !== 'string' || block.signature.length !== 128) {
        return { valid: false, error: 'Invalid locationBlock.signature' };
    }
    if (block.powProof !== undefined) {
        return validatePowProof(block.powProof);
    }

    return { valid: true };
}

export function validateHexKey40Or64(value: unknown): boolean {
    return typeof value === 'string'
        && KEY_40_OR_64_RE.test(value)
        && (value.length === 40 || value.length === 64);
}

export function validateJsonSerializableValue(value: unknown, maxLength: number): ValidationResult {
    if (value === null || value === undefined) {
        return { valid: false, error: 'Missing value' };
    }

    try {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        if (serialized.length > maxLength) {
            return { valid: false, error: 'Value too large' };
        }
    } catch {
        return { valid: false, error: 'Value not serializable' };
    }

    return { valid: true };
}
