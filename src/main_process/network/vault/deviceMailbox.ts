import { debug, warn } from '../../security/secure-logger.js';
import { createVaultPointerKey } from '../dht/kademlia/store.js';

type VaultPointerEndpoint = {
    upeerId: string;
    address: string;
};

type VaultPointerView = {
    custodians: string[];
    endpoints: VaultPointerEndpoint[];
};

export type VaultPointerKademlia = {
    findValue(key: Buffer): Promise<{ value?: unknown } | null>;
    findLocationBlock(targetId: string): Promise<{ address?: string } | null>;
};

export type VaultEndpointCandidate = {
    address: string;
    source: string;
};

export function normalizeVaultDeviceId(value: unknown): string | null {
    return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value)
        ? value.toLowerCase()
        : null;
}

export async function getMyMailboxDeviceId(): Promise<string | null> {
    try {
        const { getDeviceIdentity } = await import('../../security/deviceIdentity.js');
        const deviceId = normalizeVaultDeviceId(getDeviceIdentity()?.deviceId);
        if (deviceId) return deviceId;
        const identity = await import('../../security/identity.js');
        const legacyDeviceId = typeof identity.getMyDeviceId === 'function'
            ? normalizeVaultDeviceId(identity.getMyDeviceId())
            : null;
        return legacyDeviceId;
    } catch (err) {
        warn('Failed to resolve own vault mailbox device', err, 'vault');
        return null;
    }
}

export function createVaultPointerKeys(recipientSid: string, recipientDeviceId?: string | null): Buffer[] {
    const keys = [createVaultPointerKey(recipientSid)];
    if (recipientDeviceId) {
        keys.push(createVaultPointerKey(recipientSid, recipientDeviceId));
    }
    return keys;
}

function parseVaultPointer(value: unknown): VaultPointerView {
    if (typeof value !== 'object' || value === null) {
        return { custodians: [], endpoints: [] };
    }
    const pointer = value as { custodians?: unknown; custodianEndpoints?: unknown };
    const custodians = Array.isArray(pointer.custodians)
        ? pointer.custodians.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
        : [];
    const endpoints = Array.isArray(pointer.custodianEndpoints)
        ? pointer.custodianEndpoints.filter((entry): entry is VaultPointerEndpoint => (
            typeof entry === 'object'
            && entry !== null
            && typeof (entry as VaultPointerEndpoint).upeerId === 'string'
            && typeof (entry as VaultPointerEndpoint).address === 'string'
            && (entry as VaultPointerEndpoint).address.length > 0
        ))
        : [];
    return { custodians, endpoints };
}

export async function discoverVaultEndpoints(
    kademlia: VaultPointerKademlia | null,
    ownerSid: string,
    ownerDeviceId: string | null,
): Promise<VaultEndpointCandidate[]> {
    if (!kademlia) return [];
    const candidates = new Map<string, VaultEndpointCandidate>();
    const custodianIds = new Set<string>();
    const addCandidate = (address: unknown, source: string) => {
        if (typeof address !== 'string' || address.length === 0) return;
        const key = address.toLowerCase();
        if (!candidates.has(key)) candidates.set(key, { address, source });
    };

    for (const pointerKey of createVaultPointerKeys(ownerSid, ownerDeviceId)) {
        try {
            const result = await kademlia.findValue(pointerKey);
            const pointer = parseVaultPointer(result?.value);
            for (const endpoint of pointer.endpoints) {
                addCandidate(endpoint.address, `custodian device ${endpoint.upeerId}`);
            }
            for (const custodianId of pointer.custodians) {
                if (custodianId !== ownerSid) custodianIds.add(custodianId);
            }
        } catch (err) {
            warn('Failed to find self-vault pointers in DHT', err, 'vault');
        }
    }

    for (const custodianId of custodianIds) {
        try {
            const location = await kademlia.findLocationBlock(custodianId);
            addCandidate(location?.address, `custodian ${custodianId}`);
        } catch (err) {
            debug('Could not find self-custodian location', { custodianId }, 'vault');
        }
    }

    return Array.from(candidates.values());
}
