import sodium from 'sodium-native';
import { canonicalStringify } from './cryptoUtils.js';
import { getKademliaInstance } from './dht/shared.js';
import { identityState } from '../security/identityState.js';
import { getUPeerIdFromPublicKey, verify } from '../security/identityCrypto.js';
import { debug, warn } from '../security/secure-logger.js';
import { deriveDeviceId, type AccountDeviceCertificate } from '../security/deviceCertificate.js';
import {
    getDeviceIdentity,
    verifyDeviceCertificate,
} from '../security/deviceIdentity.js';
import { loadAccountRegistryStateResult, type AccountRegistryState } from '../security/accountRegistryState.js';

const REGISTRY_KEY_PREFIX = 'upeer-account-registry:';
const REGISTRY_MAX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const REGISTRY_CACHE_TTL_MS = 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_DEVICES = 10;
const MAX_REVOKED = 32;
const cache = new Map<string, { registry: AccountRegistry; fetchedAt: number }>();
let lastPublishedSignature = '';

export interface AccountRegistryDevice {
    deviceId: string;
    devicePublicKey: string;
    staticX25519PublicKey?: string;
    platform?: string;
    capabilities?: string[];
    authorizedAt: number;
    expiresAt: number;
    epoch: number;
}

export interface AccountRevocation {
    deviceId: string;
    revokedAt: number;
    reason: string;
}

export interface AccountRegistry {
    version: number;
    accountUpeerId: string;
    accountPublicKey: string;
    epoch: number;
    issuedAt: number;
    expiresAt: number;
    devices: AccountRegistryDevice[];
    revoked: AccountRevocation[];
    signature: string;
}

export function getMyAccountRegistry(now = Date.now()): AccountRegistry | null {
    const identity = getDeviceIdentity(now);
    if (!identity || !identityState.secretKey) return null;
    const certificate = identity.certificate;
    const persisted = loadAccountRegistryStateResult(now);
    if (persisted.status === 'invalid') return null;
    const sameAccount = persisted.status === 'ready' && persisted.state.accountUpeerId === certificate.accountUpeerId
        ? persisted.state
        : null;
    const devices = mergeRegistryDevices(certificate, sameAccount, now);
    const issuedAt = Math.max(certificate.issuedAt, sameAccount?.issuedAt ?? 0);
    const latestDeviceExpiry = Math.max(certificate.expiresAt, ...devices.map(device => device.expiresAt));
    const registry: AccountRegistry = {
        version: 1,
        accountUpeerId: certificate.accountUpeerId,
        accountPublicKey: certificate.accountPublicKey,
        epoch: Math.max(certificate.epoch, sameAccount?.epoch ?? 0, ...devices.map(device => device.epoch)),
        issuedAt,
        expiresAt: Math.min(latestDeviceExpiry, issuedAt + REGISTRY_MAX_TTL_MS),
        devices,
        revoked: sameAccount ? [...sameAccount.revoked] : [],
        signature: '',
    };
    registry.signature = signRegistry(registry);
    return registry;
}

function mergeRegistryDevices(
    certificate: AccountDeviceCertificate,
    state: AccountRegistryState | null,
    now: number,
): AccountRegistryDevice[] {
    const revoked = new Set((state?.revoked ?? []).map(item => item.deviceId));
    const merged = new Map<string, AccountRegistryDevice>();
    for (const device of state?.devices ?? []) {
        if (revoked.has(device.deviceId) || device.expiresAt <= now) continue;
        merged.set(device.deviceId, {
            deviceId: device.deviceId,
            devicePublicKey: device.devicePublicKey,
            staticX25519PublicKey: device.staticX25519PublicKey,
            platform: device.platform,
            capabilities: device.capabilities,
            authorizedAt: device.authorizedAt,
            expiresAt: device.expiresAt,
            epoch: device.epoch,
        });
    }
    if (!revoked.has(certificate.deviceId)) {
        merged.set(certificate.deviceId, {
            deviceId: certificate.deviceId,
            devicePublicKey: certificate.devicePublicKey,
            platform: certificate.platform,
            capabilities: certificate.capabilities,
            authorizedAt: certificate.issuedAt,
            expiresAt: certificate.expiresAt,
            epoch: certificate.epoch,
        });
    }
    return [...merged.values()]
        .sort((left, right) => left.deviceId.localeCompare(right.deviceId))
        .slice(0, MAX_DEVICES);
}

export async function publishMyAccountRegistry(now = Date.now()): Promise<boolean> {
    const registry = getMyAccountRegistry(now);
    const kademlia = getKademliaInstance();
    if (!registry || !kademlia || registry.signature === lastPublishedSignature) {
        return !!registry;
    }
    try {
        await kademlia.storeValue(
            accountRegistryKey(registry.accountUpeerId),
            registry,
            registry.accountUpeerId,
            registry.signature,
        );
        lastPublishedSignature = registry.signature;
        return true;
    } catch (err) {
        warn('Account registry could not be published', { error: err instanceof Error ? err.message : String(err) }, 'dht');
        return false;
    }
}

export async function findAccountRegistry(
    accountUpeerId: string,
    now = Date.now(),
): Promise<AccountRegistry | null> {
    const account = accountUpeerId.trim().toLowerCase();
    const cached = cache.get(account);
    if (cached && now < Math.min(cached.registry.expiresAt, cached.fetchedAt + REGISTRY_CACHE_TTL_MS)) {
        return cached.registry;
    }
    const kademlia = getKademliaInstance();
    if (!kademlia) return null;
    try {
        const stored = await kademlia.findValue(accountRegistryKey(account));
        if (!stored || stored.publisher !== account) return null;
        const registry = verifyAccountRegistry(stored.value, account, now);
        if (!registry) return null;
        cache.set(account, { registry, fetchedAt: now });
        return registry;
    } catch (err) {
        debug('Account registry could not be found', { account, error: err instanceof Error ? err.message : String(err) }, 'dht');
        return null;
    }
}

export function resetAccountRegistryCache(): void {
    cache.clear();
}

export function verifyAccountRegistry(
    value: unknown,
    expectedAccountUpeerId: string,
    now = Date.now(),
): AccountRegistry | null {
    const registry = parseRegistry(value);
    if (!registry) return null;
    const account = expectedAccountUpeerId.trim().toLowerCase();
    if (registry.accountUpeerId !== account) return null;
    if (getUPeerIdFromPublicKey(Buffer.from(registry.accountPublicKey, 'hex')) !== account) return null;
    if (registry.issuedAt <= 0 || registry.expiresAt <= registry.issuedAt) return null;
    if (registry.expiresAt - registry.issuedAt > REGISTRY_MAX_TTL_MS) return null;
    if (registry.issuedAt > now + CLOCK_SKEW_MS || registry.expiresAt <= now) return null;
    if (!verify(
        Buffer.from(canonicalStringify(registryPayload(registry))),
        Buffer.from(registry.signature, 'hex'),
        Buffer.from(registry.accountPublicKey, 'hex'),
    )) {
        return null;
    }
    return registry;
}

export function verifyDeviceAdmission(
    certificate: AccountDeviceCertificate,
    registry: AccountRegistry,
    now = Date.now(),
): boolean {
    const verified = verifyDeviceCertificate(certificate, registry.accountUpeerId, now);
    if (!verified) return false;
    if (registry.accountPublicKey !== certificate.accountPublicKey) return false;
    if (certificate.epoch > registry.epoch || certificate.issuedAt > registry.issuedAt) return false;
    if (registry.revoked.some(item => item.deviceId === certificate.deviceId)) return false;
    const device = registry.devices.find(item => item.deviceId === certificate.deviceId);
    if (!device) return false;
    if (device.devicePublicKey !== certificate.devicePublicKey) return false;
    if ((device.staticX25519PublicKey ?? '') !== (certificate.staticX25519PublicKey ?? '')) return false;
    if ((device.platform ?? '') !== (certificate.platform ?? '')) return false;
    if (JSON.stringify(device.capabilities ?? []) !== JSON.stringify(certificate.capabilities ?? [])) return false;
    return device.authorizedAt === certificate.issuedAt &&
        device.expiresAt === certificate.expiresAt &&
        device.epoch === certificate.epoch;
}

export function accountRegistrySignedPayload(registry: AccountRegistry): string {
    return canonicalStringify(registryPayload(registry));
}

export function accountRegistryKey(accountUpeerId: string): Buffer {
    const hash = Buffer.alloc(32);
    sodium.crypto_generichash(
        hash,
        Buffer.from(`${REGISTRY_KEY_PREFIX}${accountUpeerId.trim().toLowerCase()}`),
    );
    return hash;
}

function signRegistry(registry: AccountRegistry): string {
    if (!identityState.secretKey) throw new Error('Identity is locked');
    const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(
        signature,
        Buffer.from(canonicalStringify(registryPayload(registry))),
        identityState.secretKey,
    );
    return signature.toString('hex');
}
function registryPayload(registry: AccountRegistry): Record<string, unknown> {
    return {
        version: registry.version,
        accountUpeerId: registry.accountUpeerId,
        accountPublicKey: registry.accountPublicKey,
        epoch: registry.epoch,
        issuedAt: registry.issuedAt,
        expiresAt: registry.expiresAt,
        devices: registry.devices.map(devicePayload),
        revoked: registry.revoked.map(revocation => ({
            deviceId: revocation.deviceId,
            revokedAt: revocation.revokedAt,
            reason: revocation.reason,
        })),
    };
}

function devicePayload(device: AccountRegistryDevice): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        deviceId: device.deviceId,
        devicePublicKey: device.devicePublicKey,
        authorizedAt: device.authorizedAt,
        expiresAt: device.expiresAt,
        epoch: device.epoch,
    };
    if (device.staticX25519PublicKey) payload.staticX25519PublicKey = device.staticX25519PublicKey;
    if (device.platform) payload.platform = device.platform;
    if (device.capabilities?.length) payload.capabilities = [...device.capabilities];
    return payload;
}

function parseRegistry(value: unknown): AccountRegistry | null {
    const parsed = typeof value === 'string'
        ? (() => { try { return JSON.parse(value) as unknown; } catch { return null; } })()
        : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1) return null;
    if (typeof record.accountUpeerId !== 'string' || !isHex(record.accountUpeerId, 32)) return null;
    if (typeof record.accountPublicKey !== 'string' || !isHex(record.accountPublicKey, 32)) return null;
    if (typeof record.epoch !== 'number' || !Number.isInteger(record.epoch) || record.epoch < 0) return null;
    if (typeof record.issuedAt !== 'number' || typeof record.expiresAt !== 'number') return null;
    if (!Array.isArray(record.devices) || record.devices.length > MAX_DEVICES) return null;
    if (!Array.isArray(record.revoked) || record.revoked.length > MAX_REVOKED) return null;
    if (typeof record.signature !== 'string' || !isHex(record.signature, 64)) return null;
    const devices = record.devices.map(item => parseDevice(item, record.epoch as number));
    const revoked = record.revoked.map(parseRevocation);
    if (devices.some(item => item === null) || revoked.some(item => item === null)) return null;
    return {
        version: 1,
        accountUpeerId: record.accountUpeerId.toLowerCase(),
        accountPublicKey: record.accountPublicKey.toLowerCase(),
        epoch: record.epoch,
        issuedAt: record.issuedAt,
        expiresAt: record.expiresAt,
        devices: devices as AccountRegistryDevice[],
        revoked: revoked as AccountRevocation[],
        signature: record.signature.toLowerCase(),
    };
}

function parseDevice(value: unknown, registryEpoch: number): AccountRegistryDevice | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.deviceId !== 'string' || !isHex(record.deviceId, 32)) return null;
    if (typeof record.devicePublicKey !== 'string' || !isHex(record.devicePublicKey, 32)) return null;
    if (deriveDeviceId(record.devicePublicKey) !== record.deviceId.toLowerCase()) return null;
    if (typeof record.authorizedAt !== 'number' || typeof record.expiresAt !== 'number') return null;
    if (typeof record.epoch !== 'number' || record.epoch < 0 || record.epoch > registryEpoch) return null;
    if (record.staticX25519PublicKey !== undefined && !isOptionalHex(record.staticX25519PublicKey, 32)) return null;
    if (record.platform !== undefined && typeof record.platform !== 'string') return null;
    if (record.capabilities !== undefined) {
        if (!Array.isArray(record.capabilities) || record.capabilities.some(item => typeof item !== 'string')) {
            return null;
        }
    }
    return {
        deviceId: record.deviceId.toLowerCase(),
        devicePublicKey: record.devicePublicKey.toLowerCase(),
        staticX25519PublicKey: typeof record.staticX25519PublicKey === 'string'
            ? record.staticX25519PublicKey.toLowerCase()
            : undefined,
        platform: record.platform as string | undefined,
        capabilities: record.capabilities as string[] | undefined,
        authorizedAt: record.authorizedAt,
        expiresAt: record.expiresAt,
        epoch: record.epoch,
    };
}

function parseRevocation(value: unknown): AccountRevocation | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.deviceId !== 'string' || !isHex(record.deviceId, 32)) return null;
    if (typeof record.revokedAt !== 'number') return null;
    if (typeof record.reason !== 'string' || record.reason.length === 0 || record.reason.length > 160) return null;
    return { deviceId: record.deviceId.toLowerCase(), revokedAt: record.revokedAt, reason: record.reason };
}

function isHex(value: string, expectedBytes: number): boolean {
    return value.length === expectedBytes * 2 && /^[0-9a-f]+$/i.test(value);
}

function isOptionalHex(value: unknown, expectedBytes: number): boolean {
    if (value === undefined || value === '') return true;
    return typeof value === 'string' && isHex(value, expectedBytes);
}

