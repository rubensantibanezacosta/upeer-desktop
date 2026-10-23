import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sodium from 'sodium-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('sodium-native');

import {
    ENROLLMENT_MAX_TTL_MS,
    createEnrollmentInvite,
    createEnrollmentRequest,
    inviteIdFor,
    issueEnrollmentCertificate,
    openEnrollmentCertificate,
    openEnrollmentRequest,
    parseEnrollmentCode,
    sealEnrollmentCertificate,
} from '../../../src/main_process/security/enrollment.js';
import {
    completeAuthorizerEnrollment,
    createAuthorizerEnrollmentInvite,
} from '../../../src/main_process/security/enrollmentAuthorizer.js';
import { clearEnrollmentInvites, getEnrollmentInvite } from '../../../src/main_process/security/enrollmentInvites.js';
import {
    appendAccountRegistryRevocation,
    loadAccountRegistryState,
    normalizeRevocation,
    saveAccountRegistryState,
} from '../../../src/main_process/security/accountRegistryState.js';
import { getMyAccountRegistry, verifyAccountRegistry, verifyDeviceAdmission } from '../../../src/main_process/network/accountRegistry.js';
import { deriveDeviceId } from '../../../src/main_process/security/deviceCertificate.js';
import { getDeviceIdentity, resetDeviceIdentityCache } from '../../../src/main_process/security/deviceIdentity.js';
import { getUPeerIdFromPublicKey } from '../../../src/main_process/security/identityCrypto.js';
import { clearIdentityState, initIdentity } from '../../../src/main_process/security/identity.js';
import { identityState } from '../../../src/main_process/security/identityState.js';
import {
    beginEnrollment,
    buildSealedEnrollmentRequest,
    finishEnrollment,
    getPendingEnrollmentOffer,
} from '../../../src/main_process/security/enrollmentEnrollee.js';

const now = 1_800_000_000_000;

let userDataPath = '';

function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) throw new Error('valor requerido ausente');
    return value;
}

function keypair(): { publicKey: Buffer; secretKey: Buffer } {
    const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    sodium.crypto_sign_keypair(publicKey, secretKey);
    return { publicKey, secretKey };
}

function accountIdentity() {
    const keys = keypair();
    return { ...keys, upeerId: getUPeerIdFromPublicKey(keys.publicKey) };
}

function startRootSession() {
    initIdentity(userDataPath);
    const account = accountIdentity();
    identityState.publicKey = account.publicKey;
    identityState.secretKey = account.secretKey;
    identityState.upeerId = account.upeerId;
    identityState.isLocked = false;
    identityState.isMnemonicBased = true;
    identityState.dhtStatePath = path.join(userDataPath, 'dht_state.json');
    return account;
}

function inviteFor(account: ReturnType<typeof accountIdentity>, options: { ttlMs?: number } = {}) {
    return required(createEnrollmentInvite({
        accountUpeerId: account.upeerId,
        accountPublicKey: account.publicKey.toString('hex'),
        authorizerDeviceId: 'aa'.repeat(32),
        now,
        ...options,
    }));
}

function sealedRequestFor(
    invite: ReturnType<typeof inviteFor>,
    device: { publicKey: Buffer; secretKey: Buffer },
) {
    return required(createEnrollmentRequest({
        offer: invite.offer,
        secret: invite.secret,
        devicePublicKey: device.publicKey,
        deviceSecretKey: device.secretKey,
        platform: 'linux',
        now,
    }));
}

beforeEach(() => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'upeer-enrollment-'));
    clearIdentityState();
    clearEnrollmentInvites();
    resetDeviceIdentityCache();
});

afterEach(() => {
    clearEnrollmentInvites();
    resetDeviceIdentityCache();
    clearIdentityState();
    identityState.userDataPath = '';
    fs.rmSync(userDataPath, { recursive: true, force: true });
});

describe('protocolo OOB de enrolamiento', () => {
    it('reconstruye la oferta y el secreto desde el código', () => {
        const account = accountIdentity();
        const invite = inviteFor(account);

        const parsed = required(parseEnrollmentCode(invite.code, now));

        expect(parsed.offer).toEqual(invite.offer);
        expect(parsed.secret.equals(invite.secret)).toBe(true);
        expect(invite.offer.inviteId).toBe(inviteIdFor(invite.secret));
    });

    it('rechaza códigos caducados, manipulados o con secreto alterado', () => {
        const account = accountIdentity();
        const invite = inviteFor(account, { ttlMs: 60_000 });

        expect(parseEnrollmentCode(invite.code, now + 61_000)).toBeNull();
        expect(parseEnrollmentCode('no-es-un-codigo', now)).toBeNull();

        const payload = JSON.parse(Buffer.from(invite.code, 'base64url').toString('utf8'));
        const otherSecret = Buffer.alloc(32, 9).toString('base64url');
        const tampered = Buffer.from(JSON.stringify({ ...payload, secret: otherSecret }), 'utf8').toString('base64url');
        expect(parseEnrollmentCode(tampered, now)).toBeNull();
    });

    it('limita el TTL de la invitación', () => {
        const account = accountIdentity();
        const base = {
            accountUpeerId: account.upeerId,
            accountPublicKey: account.publicKey.toString('hex'),
            authorizerDeviceId: 'bb'.repeat(32),
            now,
        };

        expect(createEnrollmentInvite({ ...base, ttlMs: ENROLLMENT_MAX_TTL_MS + 1 })).toBeNull();
        expect(createEnrollmentInvite({ ...base, ttlMs: 0 })).toBeNull();
    });

    it('emite un certificado que el dispositivo nuevo puede abrir y verificar', () => {
        const account = accountIdentity();
        const invite = inviteFor(account);
        const device = keypair();

        const request = required(openEnrollmentRequest(
            { offer: invite.offer, secret: invite.secret },
            sealedRequestFor(invite, device),
            now,
        ));
        expect(request.devicePublicKey).toBe(device.publicKey.toString('hex'));
        expect(request.capabilities).toEqual(['dht', 'location']);

        const certificate = required(issueEnrollmentCertificate({
            request,
            accountUpeerId: account.upeerId,
            accountPublicKey: account.publicKey.toString('hex'),
            accountSecretKey: account.secretKey,
            epoch: 12,
            now,
        }));
        const sealedResponse = required(sealEnrollmentCertificate(invite.secret, certificate));

        const opened = required(openEnrollmentCertificate(invite.secret, sealedResponse, account.upeerId, now));
        expect(opened.deviceId).toBe(deriveDeviceId(device.publicKey.toString('hex')));
        expect(opened.epoch).toBe(12);
        expect(opened.accountUpeerId).toBe(account.upeerId);
    });

    it('rechaza la solicitud si la firma del dispositivo no verifica', () => {
        const account = accountIdentity();
        const invite = inviteFor(account);
        const sealed = sealedRequestFor(invite, {
            publicKey: keypair().publicKey,
            secretKey: keypair().secretKey,
        });

        expect(openEnrollmentRequest({ offer: invite.offer, secret: invite.secret }, sealed, now)).toBeNull();
    });

    it('rechaza un certificado sellado con otro secreto', () => {
        const account = accountIdentity();
        const invite = inviteFor(account);
        const device = keypair();
        const request = required(openEnrollmentRequest(
            { offer: invite.offer, secret: invite.secret },
            sealedRequestFor(invite, device),
            now,
        ));
        const certificate = required(issueEnrollmentCertificate({
            request,
            accountUpeerId: account.upeerId,
            accountPublicKey: account.publicKey.toString('hex'),
            accountSecretKey: account.secretKey,
            epoch: 1,
            now,
        }));
        const sealedResponse = required(sealEnrollmentCertificate(invite.secret, certificate));

        expect(openEnrollmentCertificate(Buffer.alloc(32, 7), sealedResponse, account.upeerId, now)).toBeNull();
    });

    it('rechaza una solicitud fuera de la ventana temporal', () => {
        const account = accountIdentity();
        const invite = inviteFor(account);
        const sealed = sealedRequestFor(invite, keypair());

        expect(openEnrollmentRequest(
            { offer: invite.offer, secret: invite.secret },
            sealed,
            now + 11 * 60 * 1000,
        )).toBeNull();
    });
});

describe('autorizador de enrolamiento', () => {
    it('emite el certificado una sola vez por invitación', () => {
        const account = startRootSession();
        const invite = required(createAuthorizerEnrollmentInvite(now));
        expect(invite.offer.accountUpeerId).toBe(account.upeerId);

        const device = keypair();
        const sealed = sealedRequestFor(invite, device);

        const issued = required(completeAuthorizerEnrollment(sealed, now));
        expect(issued.certificate.deviceId).toBe(deriveDeviceId(device.publicKey.toString('hex')));
        expect(openEnrollmentCertificate(invite.secret, issued.response, account.upeerId, now)?.deviceId)
            .toBe(issued.certificate.deviceId);
        expect(completeAuthorizerEnrollment(sealed, now)).toBeNull();
    });

    it('rechaza una solicitud de una invitación desconocida', () => {
        startRootSession();

        expect(completeAuthorizerEnrollment(
            { inviteId: 'ff'.repeat(32), nonce: '00'.repeat(24), ciphertext: '00'.repeat(48) },
            now,
        )).toBeNull();
    });

    it('rechaza autorizar sin la raíz de la cuenta', () => {
        initIdentity(userDataPath);

        expect(() => createAuthorizerEnrollmentInvite(now)).toThrow('Identity is locked');
    });
});

describe('flujo completo de enrolamiento', () => {
    it('un dispositivo sin raíz acepta el certificado emitido por la raíz', () => {
        const account = startRootSession();
        const accountKeyCopy = Buffer.from(account.secretKey);
        const accountPublicKey = Buffer.from(account.publicKey);
        const accountUpeerId = account.upeerId;
        const invite = required(createAuthorizerEnrollmentInvite(now));

        clearIdentityState();
        identityState.userDataPath = userDataPath;
        expect(beginEnrollment(invite.code, now)?.inviteId).toBe(invite.offer.inviteId);
        const sealedRequest = required(buildSealedEnrollmentRequest());
        expect(sealedRequest.inviteId).toBe(invite.offer.inviteId);
        expect(getPendingEnrollmentOffer()).not.toBeNull();

        clearIdentityState();
        identityState.userDataPath = userDataPath;
        identityState.publicKey = accountPublicKey;
        identityState.secretKey = accountKeyCopy;
        identityState.upeerId = accountUpeerId;
        identityState.isLocked = false;
        const issued = required(completeAuthorizerEnrollment(sealedRequest, now));

        clearIdentityState();
        initIdentity(userDataPath);
        expect(getPendingEnrollmentOffer()).not.toBeNull();
        const certificate = required(finishEnrollment(issued.response, now));

        expect(certificate.deviceId).toBe(issued.certificate.deviceId);
        expect(getPendingEnrollmentOffer()).toBeNull();
        const identity = required(getDeviceIdentity(now));
        expect(identity.deviceId).toBe(certificate.deviceId);
        expect(identity.certificate.accountUpeerId).toBe(accountUpeerId);
    });

    it('rechaza enrolar un dispositivo que ya tiene frase semilla', () => {
        startRootSession();
        const invite = required(createAuthorizerEnrollmentInvite(now));
        fs.writeFileSync(path.join(userDataPath, 'identity.mnemonic_mode'), '1');

        clearIdentityState();
        identityState.userDataPath = userDataPath;

        expect(beginEnrollment(invite.code, now)).toBeNull();
    });
});

describe('persistencia y registro de dispositivos', () => {
    it('conserva las invitaciones pendientes tras un reinicio', () => {
        startRootSession();
        const invite = required(createAuthorizerEnrollmentInvite(now));

        clearEnrollmentInvites();

        expect(getEnrollmentInvite(invite.offer.inviteId, now)?.code).toBe(invite.code);
    });

    it('no restaura invitaciones caducadas al reiniciar', () => {
        startRootSession();
        const invite = required(createAuthorizerEnrollmentInvite(now));

        clearEnrollmentInvites();

        expect(getEnrollmentInvite(invite.offer.inviteId, now + 16 * 60 * 1000)).toBeNull();
    });

    it('publica el registro con el dispositivo enrolado y sube el epoch', () => {
        const account = startRootSession();
        const invite = required(createAuthorizerEnrollmentInvite(now));
        const device = keypair();
        const issued = required(completeAuthorizerEnrollment(sealedRequestFor(invite, device), now));

        const registry = required(getMyAccountRegistry(now));

        expect(registry.devices.map(item => item.deviceId)).toContain(issued.certificate.deviceId);
        expect(registry.epoch).toBeGreaterThan(issued.certificate.epoch);
        expect(verifyAccountRegistry(registry, account.upeerId, now)).not.toBeNull();
        expect(verifyDeviceAdmission(issued.certificate, registry, now)).toBe(true);
    });

    it('excluye del registro los dispositivos revocados', () => {
        startRootSession();
        const invite = required(createAuthorizerEnrollmentInvite(now));
        const issued = required(completeAuthorizerEnrollment(sealedRequestFor(invite, keypair()), now));

        const state = required(loadAccountRegistryState(now));
        saveAccountRegistryState(appendAccountRegistryRevocation(
            state,
            state.accountUpeerId,
            state.epoch,
            now,
            normalizeRevocation(issued.certificate.deviceId, 'prueba', now),
        ), now);

        const registry = required(getMyAccountRegistry(now));

        expect(registry.devices.map(item => item.deviceId)).not.toContain(issued.certificate.deviceId);
        expect(verifyDeviceAdmission(issued.certificate, registry, now)).toBe(false);
    });
});
