import type { SealedEnrollmentMessage } from './enrollment.js';

const MAX_TRANSFER_CODE_LENGTH = 4096;

export function encodeEnrollmentMessage(message: SealedEnrollmentMessage): string {
    return Buffer.from(JSON.stringify(message), 'utf8').toString('base64url');
}

export function decodeEnrollmentMessage(code: unknown): unknown | null {
    if (typeof code !== 'string') return null;
    const normalized = code.replace(/\s+/g, '');
    if (normalized.length === 0 || normalized.length > MAX_TRANSFER_CODE_LENGTH) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(normalized)) return null;
    try {
        const plain = Buffer.from(normalized, 'base64url');
        if (plain.length === 0) return null;
        return JSON.parse(plain.toString('utf8'));
    } catch {
        return null;
    }
}
