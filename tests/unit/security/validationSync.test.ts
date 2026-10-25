import { describe, expect, it } from 'vitest';
import {
    validateSyncAck,
    validateSyncEnvelope,
    validateSyncHello,
    validateSyncHistoryRequest,
    validateSyncHistoryResponse,
    validateSyncReset,
} from '../../../src/main_process/security/validationSync.js';
import { validateMessage } from '../../../src/main_process/security/validation.js';

const DEVICE_ID = 'a'.repeat(64);
const DEVICE_PUBLIC_KEY = 'b'.repeat(64);
const ACCOUNT_ID = 'c'.repeat(32);
const SIGNED_PRE_KEY_SIGNATURE = 'e'.repeat(128);

const certificate = {
    version: 1,
    accountUpeerId: ACCOUNT_ID,
    accountPublicKey: 'f'.repeat(64),
    deviceId: DEVICE_ID,
    devicePublicKey: DEVICE_PUBLIC_KEY,
    issuedAt: 1,
    expiresAt: 2,
    epoch: 1,
    signature: SIGNED_PRE_KEY_SIGNATURE,
};

const encrypted = {
    senderDeviceId: DEVICE_ID,
    senderDeviceCertificate: certificate,
    recipientDeviceId: DEVICE_ID,
    content: 'ciphertext',
    nonce: 'nonce',
};

describe('Sync validation', () => {
    it('accepts a valid hello', () => {
        expect(validateSyncHello({
            deviceId: DEVICE_ID,
            deviceCertificate: certificate,
            deviceSignedPreKey: {
                spkPub: DEVICE_PUBLIC_KEY,
                spkSig: SIGNED_PRE_KEY_SIGNATURE,
                spkId: 1,
            },
            timestamp: Date.now(),
            ack: false,
        }).valid).toBe(true);
    });

    it('rejects a hello with a mismatched prekey shape', () => {
        expect(validateSyncHello({
            deviceId: DEVICE_ID,
            deviceCertificate: certificate,
            deviceSignedPreKey: { spkPub: 'short', spkSig: SIGNED_PRE_KEY_SIGNATURE, spkId: 1 },
            timestamp: Date.now(),
        }).valid).toBe(false);
    });

    it('accepts a valid envelope', () => {
        expect(validateSyncEnvelope({
            ...encrypted,
            eventId: 'event-1',
            kind: 'MESSAGE_UPSERT',
            occurredAt: Date.now(),
            sequence: 10,
            epoch: 1,
        }).valid).toBe(true);
    });

    it('rejects unknown event kinds and invalid sequences', () => {
        expect(validateSyncEnvelope({
            ...encrypted,
            eventId: 'event-1',
            kind: 'UNKNOWN',
            occurredAt: Date.now(),
            sequence: 10,
            epoch: 1,
        }).valid).toBe(false);
        expect(validateSyncEnvelope({
            ...encrypted,
            eventId: 'event-1',
            kind: 'MESSAGE_STATUS',
            occurredAt: Date.now(),
            sequence: -1,
            epoch: 1,
        }).valid).toBe(false);
    });

    it('rejects an envelope without certificate or ciphertext', () => {
        expect(validateSyncEnvelope({
            ...encrypted,
            senderDeviceCertificate: null,
            eventId: 'event-1',
            kind: 'MESSAGE_UPSERT',
            occurredAt: Date.now(),
            sequence: 10,
            epoch: 1,
        }).valid).toBe(false);
        expect(validateSyncEnvelope({
            ...encrypted,
            content: '',
            eventId: 'event-1',
            kind: 'MESSAGE_UPSERT',
            occurredAt: Date.now(),
            sequence: 10,
            epoch: 1,
        }).valid).toBe(false);
    });

    it('validates history requests and responses', () => {
        expect(validateSyncHistoryRequest({
            ...encrypted,
            requestId: 'req-1',
            cursor: null,
            limit: 50,
        }).valid).toBe(true);
        expect(validateSyncHistoryRequest({
            ...encrypted,
            requestId: '',
            cursor: null,
            limit: 50,
        }).valid).toBe(false);
        expect(validateSyncHistoryResponse({
            ...encrypted,
            requestId: 'req-1',
            entries: [],
            nextCursor: null,
            done: true,
        }).valid).toBe(true);
        expect(validateSyncHistoryResponse({
            ...encrypted,
            requestId: '',
            entries: [],
            nextCursor: null,
            done: true,
        }).valid).toBe(false);
    });

    it('validates acknowledgements', () => {
        expect(validateSyncAck({
            eventId: 'event-1',
            sequence: 10,
            senderDeviceId: DEVICE_ID,
            senderDeviceCertificate: certificate,
        }).valid).toBe(true);
        expect(validateSyncAck({
            eventId: 'event-1',
            sequence: 10,
            senderDeviceId: 'bad',
            senderDeviceCertificate: certificate,
        }).valid).toBe(false);
    });

    it('accepts a reset signed by a device of the account', () => {
        expect(validateSyncReset({
            senderDeviceId: DEVICE_ID,
            senderDeviceCertificate: certificate,
        }).valid).toBe(true);
        expect(validateSyncReset({
            senderDeviceId: 'bad',
            senderDeviceCertificate: certificate,
        }).valid).toBe(false);
        expect(validateSyncReset({
            senderDeviceId: DEVICE_ID,
            senderDeviceCertificate: null,
        }).valid).toBe(false);
    });

    it('routes the reset through the packet validator table', () => {
        expect(validateMessage('SYNC_RESET', {
            senderDeviceId: DEVICE_ID,
            senderDeviceCertificate: certificate,
        }).valid).toBe(true);
    });
});
