import sodium from 'sodium-native';
import { safeBufferFromHex } from '../network/cryptoUtils.js';
import { isYggdrasilAddress } from '../../utils/yggdrasilAddress.js';

export const IDENTITY_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
export const CERTIFICATE_MAX_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface AccountDeviceCertificate {
    version: number;
    accountUpeerId: string;
    accountPublicKey: string;
    deviceId: string;
    devicePublicKey: string;
    platform?: string;
    capabilities?: string[];
    issuedAt: number;
    expiresAt: number;
    epoch: number;
    signature: string;
    [key: string]: unknown;
}

export function deriveDeviceId(devicePublicKey: string): string | null {
    const key = safeBufferFromHex(devicePublicKey, 32, 'devicePublicKey');
    const hash = Buffer.alloc(32);
    sodium.crypto_generichash(hash, key);
    return hash.toString('hex');
}

export function parseCertificate(value: unknown): AccountDeviceCertificate | null {
    const parsed = typeof value === 'string'
        ? (() => { try { return JSON.parse(value) as unknown; } catch { return null; } })()
        : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1) return null;
    if (typeof record.accountUpeerId !== 'string' || !isHex(record.accountUpeerId, 32)) return null;
    if (typeof record.accountPublicKey !== 'string' || !isHex(record.accountPublicKey, 32)) return null;
    if (typeof record.deviceId !== 'string' || !isHex(record.deviceId, 32)) return null;
    if (typeof record.devicePublicKey !== 'string' || !isHex(record.devicePublicKey, 32)) return null;
    if (typeof record.issuedAt !== 'number' || typeof record.expiresAt !== 'number') return null;
    if (typeof record.epoch !== 'number' || !Number.isInteger(record.epoch) || record.epoch < 0) return null;
    if (typeof record.signature !== 'string' || !isHex(record.signature, 64)) return null;
    if (record.platform !== undefined && typeof record.platform !== 'string') return null;
    if (record.capabilities !== undefined) {
        if (!Array.isArray(record.capabilities) || record.capabilities.some(item => typeof item !== 'string')) {
            return null;
        }
    }
    const deviceId = deriveDeviceId(record.devicePublicKey);
    if (!deviceId || deviceId !== record.deviceId.toLowerCase()) return null;
    return {
        version: 1,
        accountUpeerId: record.accountUpeerId.toLowerCase(),
        accountPublicKey: record.accountPublicKey.toLowerCase(),
        deviceId: record.deviceId.toLowerCase(),
        devicePublicKey: record.devicePublicKey.toLowerCase(),
        platform: record.platform as string | undefined,
        capabilities: record.capabilities as string[] | undefined,
        issuedAt: record.issuedAt,
        expiresAt: record.expiresAt,
        epoch: record.epoch,
        signature: record.signature.toLowerCase(),
    };
}

export function certificatePayload(certificate: AccountDeviceCertificate): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        version: certificate.version,
        accountUpeerId: certificate.accountUpeerId,
        accountPublicKey: certificate.accountPublicKey,
        deviceId: certificate.deviceId,
        devicePublicKey: certificate.devicePublicKey,
        issuedAt: certificate.issuedAt,
        expiresAt: certificate.expiresAt,
        epoch: certificate.epoch,
    };
    if (certificate.platform) payload.platform = certificate.platform;
    if (certificate.capabilities?.length) payload.capabilities = [...certificate.capabilities];
    return payload;
}

export function certificateUsable(certificate: AccountDeviceCertificate, account: string, now: number): boolean {
    if (certificate.accountUpeerId !== account.toLowerCase()) return false;
    if (certificate.issuedAt <= 0 || certificate.expiresAt <= certificate.issuedAt) return false;
    if (certificate.expiresAt - certificate.issuedAt > CERTIFICATE_MAX_TTL_MS) return false;
    if (certificate.issuedAt > now + CLOCK_SKEW_MS) return false;
    return certificate.expiresAt > now;
}

export function normalizeAddresses(block: Record<string, unknown>): string[] | null {
    const raw = Array.isArray(block.addresses) && block.addresses.length > 0
        ? block.addresses
        : [block.address];
    if (raw.some(value => typeof value !== 'string')) return null;
    const normalized = [...new Set((raw as string[]).map(value => value.trim()))];
    if (normalized.length === 0 || normalized.some(value => !isYggdrasilAddress(value))) return null;
    return normalized.sort();
}

export function identityPeriod(now: number): { start: number; epoch: number } {
    const start = Math.floor(now / IDENTITY_PERIOD_MS) * IDENTITY_PERIOD_MS;
    return { start, epoch: Math.floor(start / IDENTITY_PERIOD_MS) + 1 };
}

export function isHex(value: string, expectedBytes: number): boolean {
    return value.length === expectedBytes * 2 && /^[0-9a-f]+$/i.test(value);
}
