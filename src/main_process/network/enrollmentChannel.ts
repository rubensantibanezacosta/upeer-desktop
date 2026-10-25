import { completeAuthorizerEnrollment } from '../security/enrollmentAuthorizer.js';
import { debug, warn } from '../security/secure-logger.js';
import { normalizeAuthorizerAddress } from '../security/enrollment.js';

export const ENROLL_REQ = 'ENROLL_REQ';
export const ENROLL_RES = 'ENROLL_RES';

type PacketRecord = Record<string, unknown>;

export type EnrollmentChannelReply = (address: string, payload: PacketRecord) => void;

function isRecord(value: unknown): value is PacketRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readInviteId(value: unknown): string {
    if (!isRecord(value)) return '';
    const candidate = value.inviteId;
    return typeof candidate === 'string' ? candidate.trim().toLowerCase() : '';
}

export function isEnrollmentPacket(type: string): boolean {
    return type === ENROLL_REQ || type === ENROLL_RES;
}

export function handleInBandEnrollment(data: PacketRecord, reply: EnrollmentChannelReply, now = Date.now()): boolean {
    const sealed = data.sealed;
    if (!isRecord(sealed)) {
        warn('Enrolamiento en banda rechazado: falta el sobre sellado', {}, 'identity');
        return false;
    }
    const target = normalizeAuthorizerAddress(data.senderAddress);
    if (!target) {
        warn('Enrolamiento en banda rechazado: el dispositivo no anuncia dirección', {}, 'identity');
        return false;
    }
    const inviteId = readInviteId(sealed);
    const issued = completeAuthorizerEnrollment(sealed, now);
    if (!issued) {
        warn('Enrolamiento en banda rechazado: invitación inválida o caducada', { inviteId }, 'identity');
        reply(target, { type: ENROLL_RES, inviteId, ok: false, error: 'invite' });
        return true;
    }
    debug('Enrolamiento en banda completado', { deviceId: issued.certificate.deviceId }, 'identity');
    reply(target, { type: ENROLL_RES, inviteId: readInviteId(issued.response), ok: true, sealed: issued.response });
    return true;
}
