import sodium from 'sodium-native';
import type { EnrollmentCode, EnrollmentOffer } from './enrollment.js';
import { debug, warn } from './secure-logger.js';

const MAX_INVITES = 8;

const pending = new Map<string, EnrollmentCode>();

export function registerEnrollmentInvite(code: EnrollmentCode, now = Date.now()): boolean {
    purgeExpired(now);
    if (pending.size >= MAX_INVITES) {
        warn('Se rechaza el enrolamiento: demasiadas invitaciones pendientes', { pending: pending.size }, 'identity');
        return false;
    }
    pending.set(code.offer.inviteId, { ...code, secret: Buffer.from(code.secret) });
    debug('Invitación de enrolamiento registrada', { inviteId: code.offer.inviteId }, 'identity');
    return true;
}

export function getEnrollmentInvite(inviteId: string, now = Date.now()): EnrollmentCode | null {
    purgeExpired(now);
    const invite = pending.get(inviteId.toLowerCase());
    if (!invite) return null;
    return { ...invite, secret: Buffer.from(invite.secret) };
}

export function listEnrollmentInvites(now = Date.now()): EnrollmentOffer[] {
    purgeExpired(now);
    return [...pending.values()].map(invite => ({ ...invite.offer }));
}

export function consumeEnrollmentInvite(inviteId: string, now = Date.now()): boolean {
    purgeExpired(now);
    const key = inviteId.toLowerCase();
    const invite = pending.get(key);
    if (!invite) return false;
    sodium.sodium_memzero(invite.secret);
    pending.delete(key);
    debug('Invitación de enrolamiento consumida', { inviteId: key }, 'identity');
    return true;
}

export function clearEnrollmentInvites(): void {
    for (const invite of pending.values()) sodium.sodium_memzero(invite.secret);
    pending.clear();
}

function purgeExpired(now: number): void {
    for (const [key, invite] of pending) {
        if (invite.offer.expiresAt <= now) {
            sodium.sodium_memzero(invite.secret);
            pending.delete(key);
            debug('Invitación de enrolamiento caducada eliminada', { inviteId: key }, 'identity');
        }
    }
}
