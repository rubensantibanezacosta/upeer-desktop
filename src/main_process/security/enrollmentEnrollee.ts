import fs from 'node:fs';
import path from 'node:path';
import sodium from 'sodium-native';
import { installDeviceCertificate } from './deviceIdentity.js';
import type { AccountDeviceCertificate } from './deviceCertificate.js';
import {
    createEnrollmentRequest,
    openEnrollmentCertificate,
    parseEnrollmentCode,
    type EnrollmentOffer,
    type SealedEnrollmentMessage,
} from './enrollment.js';
import { enableDeviceOnlyMode } from './identityMode.js';
import { identityState, MNEMONIC_MODE_FLAG } from './identityState.js';
import { warn } from './secure-logger.js';

interface PendingEnrollment {
    offer: EnrollmentOffer;
    secret: Buffer;
    deviceSecretKey: Buffer;
    sealedRequest: SealedEnrollmentMessage;
}

let pending: PendingEnrollment | null = null;

export function getPendingEnrollmentOffer(): EnrollmentOffer | null {
    return pending ? { ...pending.offer } : null;
}

export function beginEnrollment(code: string, now = Date.now()): EnrollmentOffer | null {
    cancelEnrollment();
    const parsed = parseEnrollmentCode(code, now);
    if (!parsed) {
        warn('Código de enrolamiento inválido o caducado', {}, 'identity');
        return null;
    }
    if (!identityState.userDataPath) return null;
    if (identityState.isMnemonicBased || fs.existsSync(path.join(identityState.userDataPath, MNEMONIC_MODE_FLAG))) {
        warn('Se rechaza el enrolamiento sin raíz sobre una instalación con frase semilla', {}, 'identity');
        return null;
    }
    if (!enableDeviceOnlyMode(identityState.userDataPath, {
        accountUpeerId: parsed.offer.accountUpeerId,
        accountPublicKey: parsed.offer.accountPublicKey,
    })) {
        return null;
    }
    const deviceSecretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
    const devicePublicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
    sodium.crypto_sign_keypair(devicePublicKey, deviceSecretKey);
    const sealed = createEnrollmentRequest({
        offer: parsed.offer,
        secret: parsed.secret,
        devicePublicKey,
        deviceSecretKey,
        platform: process.platform,
        now,
    });
    if (!sealed) {
        sodium.sodium_memzero(deviceSecretKey);
        return null;
    }
    pending = { offer: parsed.offer, secret: Buffer.from(parsed.secret), deviceSecretKey, sealedRequest: sealed };
    return { ...parsed.offer };
}

export function buildSealedEnrollmentRequest(): SealedEnrollmentMessage | null {
    if (!pending) return null;
    return { ...pending.sealedRequest };
}

export function finishEnrollment(sealedResponse: unknown, now = Date.now()): AccountDeviceCertificate | null {
    if (!pending) {
        warn('No hay enrolamiento en curso', {}, 'identity');
        return null;
    }
    const certificate = openEnrollmentCertificate(pending.secret, sealedResponse, pending.offer.accountUpeerId, now);
    if (!certificate) {
        warn('La respuesta de enrolamiento no es válida', {}, 'identity');
        return null;
    }
    const installed = installDeviceCertificate(pending.deviceSecretKey.toString('hex'), certificate, now);
    cancelEnrollment();
    return installed ? certificate : null;
}

export function cancelEnrollment(): void {
    if (pending) sodium.sodium_memzero(pending.deviceSecretKey);
    if (pending) sodium.sodium_memzero(pending.secret);
    pending = null;
}
