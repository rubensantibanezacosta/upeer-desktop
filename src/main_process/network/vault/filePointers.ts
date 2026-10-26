import { debug, warn } from '../../security/secure-logger.js';
import { getMyUPeerId } from '../../security/identity.js';
import { createFileVaultPointerKey } from '../dht/kademlia/store.js';
import { sendSecurePacket } from '../server/transport.js';
import { getMyMailboxDeviceId } from './deviceMailbox.js';
import { getSelfDeviceAddresses } from './selfDevices.js';

export type FileCustodianEndpoint = {
    upeerId: string;
    address: string;
};

type FilePointerKademlia = {
    findValue(key: Buffer): Promise<{ value?: unknown } | null>;
    storeValue(key: Buffer, value: FilePointerValue, publisher: string): Promise<void>;
    findClosestContacts(targetId: string, count: number): Array<{ upeerId: string; address: string }>;
};

type FilePointerValue = {
    fileHash: string;
    custodians: string[];
    custodianEndpoints: FileCustodianEndpoint[];
    updatedAt: number;
};

type ParsedFilePointer = {
    custodians: string[];
    custodianEndpoints: FileCustodianEndpoint[];
};

const MAX_QUERIED_FILES = 500;
const queriedFiles = new Set<string>();

async function getKademlia(): Promise<FilePointerKademlia | null> {
    const { getKademliaInstance } = await import('../dht/shared.js');
    return (getKademliaInstance() as FilePointerKademlia | null) ?? null;
}

function parsePointer(value: unknown): ParsedFilePointer | null {
    if (typeof value !== 'object' || value === null) {
        return null;
    }
    const candidate = value as { custodians?: unknown; custodianEndpoints?: unknown };
    const custodians = Array.isArray(candidate.custodians)
        ? candidate.custodians.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
        : [];
    const custodianEndpoints = Array.isArray(candidate.custodianEndpoints)
        ? candidate.custodianEndpoints.filter((entry): entry is FileCustodianEndpoint => (
            typeof entry === 'object'
            && entry !== null
            && typeof (entry as FileCustodianEndpoint).upeerId === 'string'
            && typeof (entry as FileCustodianEndpoint).address === 'string'
            && (entry as FileCustodianEndpoint).address.length > 0
        ))
        : [];
    return { custodians, custodianEndpoints };
}

export async function publishFileCustodianPointer(
    recipientSid: string,
    fileHash: string,
    endpoints: FileCustodianEndpoint[],
): Promise<void> {
    if (!fileHash || endpoints.length === 0) {
        return;
    }
    const kademlia = await getKademlia();
    if (!kademlia || typeof kademlia.storeValue !== 'function') {
        return;
    }
    const myId = getMyUPeerId();
    const unique = new Map<string, FileCustodianEndpoint>();
    for (const endpoint of endpoints) {
        const key = endpoint.address.toLowerCase();
        if (!unique.has(key)) {
            unique.set(key, endpoint);
        }
    }
    const value: FilePointerValue = {
        fileHash,
        custodians: Array.from(new Set([myId, ...Array.from(unique.values()).map((entry) => entry.upeerId)])),
        custodianEndpoints: Array.from(unique.values()),
        updatedAt: Date.now(),
    };
    try {
        await kademlia.storeValue(createFileVaultPointerKey(recipientSid, fileHash), value, myId);
    } catch (err) {
        warn('Failed to publish file custodian pointer', { fileHash, err: String(err) }, 'vault');
    }
}

export async function queryFileVaults(fileHash: string): Promise<number> {
    if (!fileHash || queriedFiles.has(fileHash)) {
        return 0;
    }
    if (queriedFiles.size >= MAX_QUERIED_FILES) {
        queriedFiles.clear();
    }
    queriedFiles.add(fileHash);
    const kademlia = await getKademlia();
    if (!kademlia) {
        return 0;
    }
    const myId = getMyUPeerId();
    const pointer = parsePointer((await kademlia.findValue(createFileVaultPointerKey(myId, fileHash)).catch(() => null))?.value);
    const addresses = new Map<string, string>();
    for (const endpoint of pointer?.custodianEndpoints ?? []) {
        addresses.set(endpoint.address.toLowerCase(), endpoint.address);
    }
    for (const address of await getSelfDeviceAddresses(myId, kademlia)) {
        const key = address.toLowerCase();
        if (!addresses.has(key)) {
            addresses.set(key, address);
        }
    }
    if (addresses.size === 0) {
        return 0;
    }
    const deviceId = await getMyMailboxDeviceId();
    const packet = {
        type: 'VAULT_QUERY',
        requesterSid: myId,
        fileHash,
        ...(deviceId ? { requesterDeviceId: deviceId } : {}),
        timestamp: Date.now(),
    };
    let sent = 0;
    for (const [key, address] of addresses) {
        try {
            sendSecurePacket(address, packet);
            sent += 1;
        } catch (err) {
            debug('File vault query failed', { fileHash, address: key, err: String(err) }, 'vault');
        }
    }
    return sent;
}
