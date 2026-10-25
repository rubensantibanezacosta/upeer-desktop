import { getDeviceIdentity } from './deviceIdentity.js';
import { identityPeriod, type AccountDeviceCertificate } from './deviceCertificate.js';
import { appendAuthorizedDevice, loadAccountRegistryState, saveAccountRegistryState } from './accountRegistryState.js';
import {
    createEnrollmentInvite,
    issueEnrollmentCertificate,
    openEnrollmentRequest,
    sealEnrollmentCertificate,
    type EnrollmentCode,
    type EnrollmentRequest,
    type SealedEnrollmentMessage,
} from './enrollment.js';
import { consumeEnrollmentInvite, getEnrollmentInvite, registerEnrollmentInvite } from './enrollmentInvites.js';
import { requireRootIdentity } from './identityMode.js';
import { getYggstackAddress } from '../sidecars/yggstack.js';
import { identityState } from './identityState.js';
import { publishMyAccountRegistry } from '../network/accountRegistry.js';
import { notifyDeviceRegistryChanged } from '../core/deviceRegistryEvents.js';
import { warn } from './secure-logger.js';

export interface IssuedEnrollment {
    request: EnrollmentRequest;
    certificate: AccountDeviceCertificate;
    response: SealedEnrollmentMessage;
}

export function createAuthorizerEnrollmentInvite(now = Date.now()): EnrollmentCode | null {
    requireRootIdentity('createAuthorizerEnrollmentInvite');
    const device = getDeviceIdentity(now);
    if (!device) {
        warn('No se puede enrolar sin identidad de dispositivo autorizadora', {}, 'identity');
        return null;
    }
    const code = createEnrollmentInvite({
        accountUpeerId: identityState.upeerId,
        accountPublicKey: device.certificate.accountPublicKey,
        authorizerDeviceId: device.deviceId,
        authorizerAddress: getYggstackAddress() ?? undefined,
        now,
    });
    if (!code) return null;
    if (!registerEnrollmentInvite(code, now)) return null;
    return code;
}

export function completeAuthorizerEnrollment(sealed: unknown, now = Date.now()): IssuedEnrollment | null {
    requireRootIdentity('completeAuthorizerEnrollment');
    const inviteId = readInviteId(sealed);
    if (!inviteId) return null;
    const invite = getEnrollmentInvite(inviteId, now);
    if (!invite) {
        warn('Enrolamiento rechazado: invitación desconocida o caducada', {}, 'identity');
        return null;
    }
    const request = openEnrollmentRequest(invite, sealed, now);
    if (!request) {
        warn('Enrolamiento rechazado: solicitud inválida', {}, 'identity');
        return null;
    }
    if (!identityState.secretKey) return null;
    const certificate = issueEnrollmentCertificate({
        request,
        accountUpeerId: invite.offer.accountUpeerId,
        accountPublicKey: invite.offer.accountPublicKey,
        accountSecretKey: identityState.secretKey,
        epoch: identityPeriod(now).epoch,
        now,
    });
    if (!certificate) {
        warn('Enrolamiento rechazado: no se pudo emitir el certificado', {}, 'identity');
        return null;
    }
    const response = sealEnrollmentCertificate(invite.secret, certificate);
    if (!response) return null;
    if (!consumeEnrollmentInvite(inviteId, now)) {
        warn('Enrolamiento rechazado: la invitación ya se consumió', {}, 'identity');
        return null;
    }
    recordAuthorizedDevice(certificate, now);
    void publishMyAccountRegistry(now).catch(() => false);
    return { request, certificate, response };
}

function recordAuthorizedDevice(certificate: AccountDeviceCertificate, now: number): void {
    try {
        const state = loadAccountRegistryState(now);
        const next = appendAuthorizedDevice(state, certificate.accountUpeerId, certificate);
        if (!saveAccountRegistryState(next, now)) {
            warn('No se pudo persistir el dispositivo autorizado', { deviceId: certificate.deviceId }, 'identity');
            return;
        }
        notifyDeviceRegistryChanged();
    } catch (err) {
        warn('No se pudo registrar el dispositivo autorizado', {
            deviceId: certificate.deviceId,
            error: err instanceof Error ? err.message : String(err),
        }, 'identity');
    }
}

function readInviteId(sealed: unknown): string | null {
    if (typeof sealed !== 'object' || sealed === null || Array.isArray(sealed)) return null;
    const value = (sealed as Record<string, unknown>).inviteId;
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}
