import type { ValidationResult } from './validationShared.js';
import { SYNC_EVENT_KINDS } from '../network/sync/types.js';

const MAX_CONTENT_LENGTH = 8_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHex(value: unknown, bytes: number): value is string {
    return typeof value === 'string' && value.length === bytes * 2 && /^[0-9a-f]+$/i.test(value);
}

function isCertificate(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return isHex(value.deviceId, 32)
        && isHex(value.devicePublicKey, 32)
        && typeof value.signature === 'string'
        && typeof value.accountUpeerId === 'string';
}

function isSignedPreKey(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return isHex(value.spkPub, 32)
        && isHex(value.spkSig, 64)
        && typeof value.spkId === 'number'
        && Number.isInteger(value.spkId)
        && value.spkId > 0;
}

function isRatchetHeader(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return isHex(value.dh, 32)
        && typeof value.pn === 'number'
        && typeof value.n === 'number';
}

function isX3dhInit(value: unknown): boolean {
    if (!isRecord(value)) return false;
    return isHex(value.ekPub, 32)
        && isHex(value.ikPub, 32)
        && typeof value.spkId === 'number';
}

function validateEncryptedFields(data: Record<string, unknown>): ValidationResult {
    if (!isHex(data.senderDeviceId, 32)) {
        return { valid: false, error: 'Invalid senderDeviceId' };
    }
    if (!isCertificate(data.senderDeviceCertificate)) {
        return { valid: false, error: 'Invalid senderDeviceCertificate' };
    }
    if (!isHex(data.recipientDeviceId, 32)) {
        return { valid: false, error: 'Invalid recipientDeviceId' };
    }
    if (typeof data.content !== 'string' || data.content.length === 0 || data.content.length > MAX_CONTENT_LENGTH) {
        return { valid: false, error: 'Invalid sync content' };
    }
    if (typeof data.nonce !== 'string' || data.nonce.length === 0 || data.nonce.length > 256) {
        return { valid: false, error: 'Invalid sync nonce' };
    }
    if (data.ratchetHeader !== undefined && !isRatchetHeader(data.ratchetHeader)) {
        return { valid: false, error: 'Invalid ratchetHeader' };
    }
    if (data.x3dhInit !== undefined && !isX3dhInit(data.x3dhInit)) {
        return { valid: false, error: 'Invalid x3dhInit' };
    }
    return { valid: true };
}

export function validateSyncHello(data: Record<string, unknown>): ValidationResult {
    if (!isHex(data.deviceId, 32)) {
        return { valid: false, error: 'Invalid deviceId' };
    }
    if (!isCertificate(data.deviceCertificate)) {
        return { valid: false, error: 'Invalid deviceCertificate' };
    }
    if (!isSignedPreKey(data.deviceSignedPreKey)) {
        return { valid: false, error: 'Invalid deviceSignedPreKey' };
    }
    if (typeof data.timestamp !== 'number' || !Number.isFinite(data.timestamp)) {
        return { valid: false, error: 'Invalid timestamp' };
    }
    if (data.ack !== undefined && typeof data.ack !== 'boolean') {
        return { valid: false, error: 'Invalid ack flag' };
    }
    return { valid: true };
}

export function validateSyncEnvelope(data: Record<string, unknown>): ValidationResult {
    const encrypted = validateEncryptedFields(data);
    if (!encrypted.valid) return encrypted;
    if (typeof data.eventId !== 'string' || data.eventId.length === 0 || data.eventId.length > 128) {
        return { valid: false, error: 'Invalid eventId' };
    }
    if (typeof data.kind !== 'string' || !SYNC_EVENT_KINDS.includes(data.kind as never)) {
        return { valid: false, error: 'Invalid sync kind' };
    }
    if (typeof data.occurredAt !== 'number' || !Number.isFinite(data.occurredAt)) {
        return { valid: false, error: 'Invalid occurredAt' };
    }
    if (typeof data.sequence !== 'number' || !Number.isSafeInteger(data.sequence) || data.sequence < 0) {
        return { valid: false, error: 'Invalid sequence' };
    }
    if (typeof data.epoch !== 'number' || !Number.isInteger(data.epoch) || data.epoch < 0) {
        return { valid: false, error: 'Invalid epoch' };
    }
    return { valid: true };
}

export function validateSyncHistoryRequest(data: Record<string, unknown>): ValidationResult {
    const encrypted = validateEncryptedFields(data);
    if (!encrypted.valid) return encrypted;
    if (typeof data.requestId !== 'string' || data.requestId.length === 0 || data.requestId.length > 128) {
        return { valid: false, error: 'Invalid requestId' };
    }
    return { valid: true };
}

export function validateSyncHistoryResponse(data: Record<string, unknown>): ValidationResult {
    const encrypted = validateEncryptedFields(data);
    if (!encrypted.valid) return encrypted;
    if (typeof data.requestId !== 'string' || data.requestId.length === 0 || data.requestId.length > 128) {
        return { valid: false, error: 'Invalid requestId' };
    }
    return { valid: true };
}

export function validateSyncAck(data: Record<string, unknown>): ValidationResult {
    if (typeof data.eventId !== 'string' || data.eventId.length === 0 || data.eventId.length > 128) {
        return { valid: false, error: 'Invalid eventId' };
    }
    if (typeof data.sequence !== 'number' || !Number.isSafeInteger(data.sequence) || data.sequence < 0) {
        return { valid: false, error: 'Invalid sequence' };
    }
    if (!isHex(data.senderDeviceId, 32)) {
        return { valid: false, error: 'Invalid senderDeviceId' };
    }
    if (!isCertificate(data.senderDeviceCertificate)) {
        return { valid: false, error: 'Invalid senderDeviceCertificate' };
    }
    return { valid: true };
}


export function validateEnrollRequest(data: Record<string, unknown>): ValidationResult {
    if (!isRecord(data.sealed)) {
        return { valid: false, error: 'Invalid sealed envelope' };
    }
    if (!isHex(data.sealed.inviteId, 32)) {
        return { valid: false, error: 'Invalid inviteId' };
    }
    if (typeof data.sealed.nonce !== 'string' || typeof data.sealed.ciphertext !== 'string') {
        return { valid: false, error: 'Invalid sealed payload' };
    }
    if (typeof data.senderAddress !== 'string' || !data.senderAddress.includes(':')) {
        return { valid: false, error: 'Invalid senderAddress' };
    }
    return { valid: true };
}

export function validateEnrollResponse(data: Record<string, unknown>): ValidationResult {
    if (typeof data.inviteId !== 'string' || data.inviteId.length > 64) {
        return { valid: false, error: 'Invalid inviteId' };
    }
    if (typeof data.ok !== 'boolean') {
        return { valid: false, error: 'Invalid ok flag' };
    }
    if (data.ok && !isRecord(data.sealed)) {
        return { valid: false, error: 'Invalid sealed envelope' };
    }
    return { valid: true };
}
