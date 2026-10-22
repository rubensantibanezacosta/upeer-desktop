import { warn } from '../security/secure-logger.js';
import { verifyDeviceCertificate } from '../security/deviceIdentity.js';
import { findAccountRegistry, verifyDeviceAdmission, type AccountRegistry } from './accountRegistry.js';
import { getKademliaInstance } from './dht/shared.js';
import { verifyLocationBlockWithDHT } from './locationBlocks.js';
import type { LocationBlock } from './types.js';

const ACCOUNT_HEX = /^[0-9a-f]{64}$/i;
const DECISION_TTL_MS = 60 * 1000;
const MAX_DECISIONS = 256;

type LogFn = (message: string, data?: unknown, source?: string) => void;

export type ContactAdmissionPolicy = 'reject' | 'allow-with-audit';

export type ContactAdmissionOptions = {
    now?: number;
    policy?: ContactAdmissionPolicy;
    findRegistry?: (account: string, now: number) => Promise<AccountRegistry | null>;
    findLocation?: (account: string) => Promise<LocationBlock | null>;
    verifyCertificate?: typeof verifyDeviceCertificate;
    verifyAdmission?: typeof verifyDeviceAdmission;
    verifyLocation?: typeof verifyLocationBlockWithDHT;
    warn?: LogFn;
    debug?: LogFn;
};

export class ContactAdmissionError extends Error {
    readonly reason: string;

    constructor(reason: string) {
        super(`contact admission rejected: ${reason}`);
        this.name = 'ContactAdmissionError';
        this.reason = reason;
    }
}

const decisions = new Map<string, { epoch: number; expiresAt: number }>();
const auditedLegacy = new Set<string>();

export function resetContactAdmissionCache(): void {
    decisions.clear();
    auditedLegacy.clear();
}

export async function requireContactAdmission(
    upeerId: string,
    publicKeyHex: string | null | undefined,
    options: ContactAdmissionOptions = {},
): Promise<void> {
    const account = upeerId.trim().toLowerCase();
    const publicKey = publicKeyHex?.trim().toLowerCase() ?? '';
    const logDebug = options.debug;
    if (!ACCOUNT_HEX.test(account) || !ACCOUNT_HEX.test(publicKey)) {
        logDebug?.('Contact admission skipped for a non-account identifier', { upeerId }, 'security');
        return;
    }

    const now = options.now ?? Date.now();
    const cached = decisions.get(account);
    if (cached && cached.epoch === -1 && now < cached.expiresAt) return;

    const policy = options.policy ?? 'allow-with-audit';
    const logWarn = options.warn ?? warn;
    const registry = await loadRegistry(options.findRegistry ?? findAccountRegistry, account, now, logWarn);
    const epoch = registry?.epoch ?? -1;
    if (cached && cached.epoch === epoch && now < cached.expiresAt) return;
    if (!registry) {
        allowLegacy(account, epoch, now + DECISION_TTL_MS, policy, 'account registry is unavailable', logWarn);
        return;
    }
    if (registry.expiresAt <= now) deny(account, 'account registry is expired');

    const location = await loadLocation(options.findLocation ?? findContactLocation, account, logWarn);
    if (!location) {
        allowLegacy(account, registry.epoch, registry.expiresAt, policy, 'contact has no verified location', logWarn);
        return;
    }
    if (!location.deviceCertificate) {
        allowLegacy(account, registry.epoch, registry.expiresAt, policy, 'contact location has no device certificate', logWarn);
        return;
    }

    const verifyCertificate = options.verifyCertificate ?? verifyDeviceCertificate;
    const certificate = verifyCertificate(location.deviceCertificate, account, now);
    if (!certificate) deny(account, 'contact device certificate is invalid');

    const verifyAdmission = options.verifyAdmission ?? verifyDeviceAdmission;
    if (!verifyAdmission(certificate, registry, now)) deny(account, 'contact device is not admitted');

    const verifyLocation = options.verifyLocation ?? verifyLocationBlockWithDHT;
    let locationValid = false;
    try {
        locationValid = await verifyLocation(account, location, publicKey);
    } catch (err) {
        logWarn('Contact location verification failed', { account, error: errorMessage(err) }, 'security');
    }
    if (!locationValid) deny(account, 'contact location is invalid');

    remember(account, epoch, Math.min(now + DECISION_TTL_MS, registry.expiresAt));
}

async function loadRegistry(
    find: NonNullable<ContactAdmissionOptions['findRegistry']>,
    account: string,
    now: number,
    log: LogFn,
): Promise<AccountRegistry | null> {
    try {
        return await find(account, now);
    } catch (err) {
        log('Contact account registry lookup failed', { account, error: errorMessage(err) }, 'security');
        return null;
    }
}

async function loadLocation(
    find: NonNullable<ContactAdmissionOptions['findLocation']>,
    account: string,
    log: LogFn,
): Promise<LocationBlock | null> {
    try {
        return await find(account);
    } catch (err) {
        log('Contact location lookup failed', { account, error: errorMessage(err) }, 'security');
        return null;
    }
}

async function findContactLocation(account: string): Promise<LocationBlock | null> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return null;
    return await kademlia.findLocationBlock(account) as LocationBlock | null;
}

function allowLegacy(
    account: string,
    epoch: number,
    expiresAt: number,
    policy: ContactAdmissionPolicy,
    reason: string,
    log: LogFn,
): void {
    if (policy === 'reject') deny(account, reason);
    const auditKey = `${account}:${epoch}`;
    if (!auditedLegacy.has(auditKey)) {
        if (auditedLegacy.size >= MAX_DECISIONS) {
            const oldest = auditedLegacy.values().next().value;
            if (oldest) auditedLegacy.delete(oldest);
        }
        auditedLegacy.add(auditKey);
        log(`Contacto admitido por política legacy: ${reason}`, { account, epoch }, 'security');
    }
    remember(account, epoch, expiresAt);
}

function deny(account: string, reason: string): never {
    decisions.delete(account);
    throw new ContactAdmissionError(reason);
}

function remember(account: string, epoch: number, expiresAt: number): void {
    if (!decisions.has(account) && decisions.size >= MAX_DECISIONS) {
        const oldest = decisions.keys().next().value;
        if (oldest) decisions.delete(oldest);
    }
    decisions.set(account, { epoch, expiresAt });
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

