import fs from 'node:fs';
import path from 'node:path';
import sodium from 'sodium-native';
import { type EnrollmentCode, type EnrollmentOffer } from './enrollment.js';
import { isHex } from './deviceCertificate.js';
import { getOrCreateDeviceKey } from './identityStorage.js';
import { identityState } from './identityState.js';
import { debug, warn } from './secure-logger.js';

const STATE_FILE = 'enrollment-invites.enc';
const MAX_PERSISTED = 8;

const pending = new Map<string, EnrollmentCode>();
let loaded = false;

export function registerEnrollmentInvite(code: EnrollmentCode, now = Date.now()): boolean {
    ensureLoaded(now);
    purgeExpired(now);
    if (pending.size >= MAX_PERSISTED) {
        warn('Se rechaza el enrolamiento: demasiadas invitaciones pendientes', { pending: pending.size }, 'identity');
        return false;
    }
    pending.set(code.offer.inviteId, { ...code, secret: Buffer.from(code.secret) });
    persist();
    debug('Invitación de enrolamiento registrada', { inviteId: code.offer.inviteId }, 'identity');
    return true;
}

export function getEnrollmentInvite(inviteId: string, now = Date.now()): EnrollmentCode | null {
    ensureLoaded(now);
    purgeExpired(now);
    const invite = pending.get(inviteId.toLowerCase());
    if (!invite) return null;
    return { ...invite, secret: Buffer.from(invite.secret) };
}

export function listEnrollmentInvites(now = Date.now()): EnrollmentOffer[] {
    ensureLoaded(now);
    purgeExpired(now);
    return [...pending.values()].map(invite => ({ ...invite.offer }));
}

export function consumeEnrollmentInvite(inviteId: string, now = Date.now()): boolean {
    ensureLoaded(now);
    purgeExpired(now);
    const key = inviteId.toLowerCase();
    const invite = pending.get(key);
    if (!invite) return false;
    sodium.sodium_memzero(invite.secret);
    pending.delete(key);
    persist();
    debug('Invitación de enrolamiento consumida', { inviteId: key }, 'identity');
    return true;
}

export function clearEnrollmentInvites(removeFile = false): void {
    for (const invite of pending.values()) sodium.sodium_memzero(invite.secret);
    pending.clear();
    loaded = false;
    if (!removeFile) return;
    const file = stateFile();
    if (file && fs.existsSync(file)) fs.rmSync(file, { force: true });
}

function ensureLoaded(now: number): void {
    if (loaded) return;
    loaded = true;
    const file = stateFile();
    if (!file || !fs.existsSync(file)) return;
    try {
        const deviceKey = getOrCreateDeviceKey(identityState.userDataPath);
        const blob = fs.readFileSync(file);
        if (blob.length <= sodium.crypto_secretbox_NONCEBYTES + sodium.crypto_secretbox_MACBYTES) return;
        const nonce = blob.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
        const cipher = blob.subarray(sodium.crypto_secretbox_NONCEBYTES);
        const plain = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES);
        if (!sodium.crypto_secretbox_open_easy(plain, cipher, nonce, deviceKey)) {
            warn('Las invitaciones de enrolamiento no se pudieron descifrar', {}, 'identity');
            return;
        }
        const parsed = JSON.parse(plain.toString('utf8')) as unknown;
        if (!Array.isArray(parsed)) return;
        for (const entry of parsed.slice(0, MAX_PERSISTED)) {
            const invite = parsePersistedInvite(entry, now);
            if (invite) pending.set(invite.offer.inviteId, invite);
        }
        debug('Invitaciones de enrolamiento restauradas', { count: pending.size }, 'identity');
    } catch (err) {
        warn('Las invitaciones de enrolamiento no se pudieron leer', { error: errorMessage(err) }, 'identity');
    }
}

function persist(): void {
    const file = stateFile();
    if (!file) return;
    try {
        const deviceKey = getOrCreateDeviceKey(identityState.userDataPath);
        const entries = [...pending.values()].slice(0, MAX_PERSISTED).map(invite => ({
            offer: invite.offer,
            secret: invite.secret.toString('base64url'),
            code: invite.code,
        }));
        const payload = Buffer.from(JSON.stringify(entries), 'utf8');
        const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
        sodium.randombytes_buf(nonce);
        const cipher = Buffer.alloc(payload.length + sodium.crypto_secretbox_MACBYTES);
        sodium.crypto_secretbox_easy(cipher, payload, nonce, deviceKey);
        fs.writeFileSync(file, Buffer.concat([nonce, cipher]), { mode: 0o600 });
    } catch (err) {
        warn('Las invitaciones de enrolamiento no se pudieron persistir', { error: errorMessage(err) }, 'identity');
    }
}

function parsePersistedInvite(value: unknown, now: number): EnrollmentCode | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.code !== 'string' || record.code.length === 0) return null;
    if (typeof record.secret !== 'string' || !/^[A-Za-z0-9_-]+$/.test(record.secret)) return null;
    const secret = Buffer.from(record.secret, 'base64url');
    if (secret.length !== 32) return null;
    const offer = record.offer;
    if (!offer || typeof offer !== 'object' || Array.isArray(offer)) return null;
    const fields = offer as Record<string, unknown>;
    if (typeof fields.accountUpeerId !== 'string' || !isHex(fields.accountUpeerId, 32)) return null;
    if (typeof fields.accountPublicKey !== 'string' || !isHex(fields.accountPublicKey, 32)) return null;
    if (typeof fields.authorizerDeviceId !== 'string' || !isHex(fields.authorizerDeviceId, 32)) return null;
    if (typeof fields.inviteId !== 'string' || !isHex(fields.inviteId, 32)) return null;
    if (typeof fields.expiresAt !== 'number' || fields.expiresAt <= now) return null;
    return {
        offer: {
            version: 1,
            accountUpeerId: fields.accountUpeerId.toLowerCase(),
            accountPublicKey: fields.accountPublicKey.toLowerCase(),
            authorizerDeviceId: fields.authorizerDeviceId.toLowerCase(),
            inviteId: fields.inviteId.toLowerCase(),
            expiresAt: fields.expiresAt,
        },
        secret,
        code: record.code,
    };
}

function purgeExpired(now: number): void {
    let changed = false;
    for (const [key, invite] of pending) {
        if (invite.offer.expiresAt <= now) {
            sodium.sodium_memzero(invite.secret);
            pending.delete(key);
            changed = true;
            debug('Invitación de enrolamiento caducada eliminada', { inviteId: key }, 'identity');
        }
    }
    if (changed) persist();
}

function stateFile(): string | null {
    return identityState.userDataPath ? path.join(identityState.userDataPath, STATE_FILE) : null;
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
