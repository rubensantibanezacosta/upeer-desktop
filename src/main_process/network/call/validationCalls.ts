import type { CallMediaKind } from './callTypes.js';

const CALL_TYPES = new Set([
    'CALL_OFFER',
    'CALL_RING',
    'CALL_ACCEPT',
    'CALL_REJECT',
    'CALL_BUSY',
    'CALL_CANCEL',
    'CALL_END',
    'CALL_MEDIA',
    'CALL_MEDIA_UPDATE',
    'CALL_META',
]);

const MAX_CALL_ID = 128;
const MAX_MEDIA_PAYLOAD = 1024 * 1024;

export function isValidCallId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_CALL_ID;
}

export function isValidMediaKind(value: unknown): value is CallMediaKind {
    return value === 'audio' || value === 'video';
}

export type CallValidationResult = {
    valid: boolean;
    reason?: string;
};

export function validateCallPacket(type: string, data: Record<string, unknown>): CallValidationResult {
    if (!CALL_TYPES.has(type)) {
        return { valid: false, reason: 'unknown-call-type' };
    }
    if (!isValidCallId(data.callId)) {
        return { valid: false, reason: 'invalid-call-id' };
    }
    if (type === 'CALL_OFFER' && !isValidMediaKind(data.kind)) {
        return { valid: false, reason: 'invalid-kind' };
    }
    if (type === 'CALL_MEDIA') {
        if (typeof data.data !== 'string' || data.data.length === 0 || data.data.length > MAX_MEDIA_PAYLOAD) {
            return { valid: false, reason: 'invalid-media' };
        }
    }
    return { valid: true };
}
