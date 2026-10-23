import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('sodium-native');

import {
    ENROLLMENT_MAX_REQUEST_AGE_MS,
    openEnrollmentCertificate,
    openEnrollmentRequest,
    parseEnrollmentCode,
} from '../../../src/main_process/security/enrollment.js';
import { deriveDeviceId } from '../../../src/main_process/security/deviceCertificate.js';

interface EnrollmentVector {
    generatedBy: string;
    protocol: string;
    now: number;
    accountUpeerId: string;
    accountPublicKey: string;
    devicePublicKey: string;
    secret: string;
    authorizerDeviceId: string;
    code: string;
    offer: { inviteId: string; expiresAt: number };
    desktopRequest: { inviteId: string; nonce: string; ciphertext: string };
    desktopResponse: { inviteId: string; nonce: string; ciphertext: string };
    goRequest: { inviteId: string; nonce: string; ciphertext: string };
    goPlatform: string;
    goCapabilities: string[];
    goResponse: { inviteId: string; nonce: string; ciphertext: string };
}

const vectorPath = path.join(process.cwd(), 'tests', 'fixtures', 'enrollment_vectors.json');
const vector = JSON.parse(fs.readFileSync(vectorPath, 'utf8')) as EnrollmentVector;

describe('vectores de enrolamiento compartidos con Android', () => {
    it('el vector lo generó este cliente y usa el protocolo B10', () => {
        expect(vector.generatedBy).toBe('upper-desktop');
        expect(vector.protocol).toBe('b10-enrollment');
    });

    it('reconstruye la invitación desde el código', () => {
        const invite = parseEnrollmentCode(vector.code, vector.now);
        expect(invite).not.toBeNull();
        expect(invite?.offer.inviteId).toBe(vector.offer.inviteId);
        expect(invite?.offer.accountUpeerId).toBe(vector.accountUpeerId);
        expect(invite?.offer.accountPublicKey).toBe(vector.accountPublicKey);
        expect(invite?.offer.authorizerDeviceId).toBe(vector.authorizerDeviceId);
        expect(invite?.offer.expiresAt).toBe(vector.offer.expiresAt);
        expect(invite?.secret.toString('hex')).toBe(vector.secret);
        expect(parseEnrollmentCode(vector.code, vector.offer.expiresAt)).toBeNull();
    });

    it('abre la solicitud sellada construida por Android', () => {
        const invite = parseEnrollmentCode(vector.code, vector.now);
        if (!invite) throw new Error('invitación no reconstruida');

        const request = openEnrollmentRequest(invite, vector.goRequest, vector.now);
        expect(request).not.toBeNull();
        expect(request?.devicePublicKey).toBe(vector.devicePublicKey);
        expect(request?.deviceId).toBe(deriveDeviceId(vector.devicePublicKey));
        expect(request?.accountUpeerId).toBe(vector.accountUpeerId);
        expect(request?.inviteId).toBe(vector.offer.inviteId);
        expect(request?.platform).toBe(vector.goPlatform);
        expect(request?.capabilities).toEqual(vector.goCapabilities);
    });

    it('abre la solicitud del vector original de escritorio', () => {
        const invite = parseEnrollmentCode(vector.code, vector.now);
        if (!invite) throw new Error('invitación no reconstruida');

        expect(openEnrollmentRequest(invite, vector.desktopRequest, vector.now)).not.toBeNull();
        expect(openEnrollmentRequest(invite, vector.desktopRequest, vector.now + ENROLLMENT_MAX_REQUEST_AGE_MS + 1)).toBeNull();
    });

    it('acepta los certificados que Android puede verificar', () => {
        const invite = parseEnrollmentCode(vector.code, vector.now);
        if (!invite) throw new Error('invitación no reconstruida');

        for (const sealed of [vector.desktopResponse, vector.goResponse]) {
            const certificate = openEnrollmentCertificate(invite.secret, sealed, vector.accountUpeerId, vector.now);
            expect(certificate).not.toBeNull();
            expect(certificate?.devicePublicKey).toBe(vector.devicePublicKey);
            expect(certificate?.deviceId).toBe(deriveDeviceId(vector.devicePublicKey));
            expect(certificate?.staticX25519PublicKey).toBeUndefined();
        }
    });

    it('rechaza un certificado con una cuenta distinta', () => {
        const invite = parseEnrollmentCode(vector.code, vector.now);
        if (!invite) throw new Error('invitación no reconstruida');

        expect(openEnrollmentCertificate(invite.secret, vector.goResponse, 'ff'.repeat(32), vector.now)).toBeNull();
    });
});
