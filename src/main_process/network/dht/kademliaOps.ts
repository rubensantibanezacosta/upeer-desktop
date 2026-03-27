import { randomBytes } from 'node:crypto';
import { getContactByUpeerId } from '../../storage/contacts/operations.ts';
import { updateContactDhtLocation } from '../../storage/contacts/location.ts';
import { getMyUPeerId } from '../../security/identity.js';
import { verifyRenewalToken } from '../utils.js';
import { network, security, error } from '../../security/secure-logger.js';
import { pendingQueries } from './pendingQueries.js';
import type { StoredValue, KademliaContact } from './kademlia/types.js';
import type { KademliaContactInfo, LocationBlock } from '../types.js';

type ExpiringLocationBlock = Partial<LocationBlock> & {
    expiresAt: number;
    renewalToken?: LocationBlock['renewalToken'];
};

type RenewalKademlia = {
    getAllStoredValues: () => StoredValue[];
    storeLocationBlock: (upeerId: string, locationBlock: LocationBlock) => Promise<void>;
    upeerId?: string;
};

type MaintenanceKademlia = RenewalKademlia & {
    performMaintenance: () => Promise<void> | void;
};

type LookupKademlia = {
    findLocationBlock: (upeerId: string) => Promise<LocationBlock | null>;
};

type SearchKademlia = {
    findClosestContacts: (targetUpeerId: string, limit?: number) => KademliaContact[];
};

type DhtFindNodePacket = {
    type: 'DHT_FIND_NODE';
    targetId: string;
    queryId: string;
};

function isRenewableLocationBlock(value: unknown): value is ExpiringLocationBlock {
    if (typeof value !== 'object' || value === null) return false;

    const candidate = value as Partial<ExpiringLocationBlock>;
    return typeof candidate.expiresAt === 'number';
}

function getStoredValuesFromKademlia(kademlia: RenewalKademlia): StoredValue[] {
    return kademlia.getAllStoredValues();
}

export async function publishLocationBlock(locationBlock: LocationBlock, getKademliaInstance: () => RenewalKademlia | null): Promise<void> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return;

    await kademlia.storeLocationBlock(kademlia.upeerId || getMyUPeerId(), locationBlock);
    network('Published location block to Kademlia', undefined, {
        dhtSeq: locationBlock.dhtSeq,
        hasRenewalToken: !!locationBlock.renewalToken,
        addresses: locationBlock.addresses?.length || 1
    }, 'kademlia');
}

export async function performAutoRenewal(getKademliaInstance: () => RenewalKademlia | null): Promise<void> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return;

    const allValues = getStoredValuesFromKademlia(kademlia);
    if (allValues.length === 0) return;
    const now = Date.now();
    const renewalThreshold = 3 * 24 * 60 * 60 * 1000;

    for (const storedValue of allValues) {
        if (!isRenewableLocationBlock(storedValue.value)) continue;

        const locationBlock = storedValue.value;

        const timeToExpire = locationBlock.expiresAt - now;
        if (timeToExpire >= renewalThreshold || timeToExpire <= 0) continue;
        if (!locationBlock.renewalToken) continue;

        const token = locationBlock.renewalToken;
        if (token.allowedUntil <= now || token.renewalsUsed >= token.maxRenewals) continue;

        const publisherContact = await getContactByUpeerId(storedValue.publisher);
        if (!publisherContact?.publicKey) continue;
        if (!verifyRenewalToken(token, publisherContact.publicKey)) {
            security('Auto-renewal rejected: invalid renewal token signature', { publisher: storedValue.publisher }, 'dht');
            continue;
        }

        const renewedBlock: ExpiringLocationBlock = { ...locationBlock };
        renewedBlock.expiresAt = now + (30 * 24 * 60 * 60 * 1000);
        token.renewalsUsed += 1;

        await kademlia.storeLocationBlock(storedValue.publisher, renewedBlock as LocationBlock);
        network('Auto-renewed location block', undefined, {
            targetId: storedValue.publisher,
            renewalsUsed: token.renewalsUsed
        }, 'auto-renewal');

        const contact = await getContactByUpeerId(storedValue.publisher);
        if (contact && renewedBlock.address && typeof renewedBlock.dhtSeq === 'number' && typeof renewedBlock.signature === 'string') {
            updateContactDhtLocation(
                storedValue.publisher,
                renewedBlock.addresses || renewedBlock.address,
                renewedBlock.dhtSeq,
                renewedBlock.signature,
                renewedBlock.expiresAt,
                renewedBlock.renewalToken
            );
        }
    }
}

export async function findNodeLocation(upeerId: string, getKademliaInstance: () => LookupKademlia | null): Promise<LocationBlock | null> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return null;

    const locationBlock = await kademlia.findLocationBlock(upeerId);
    return locationBlock || null;
}

export async function iterativeFindNode(upeerId: string, sendMessage: (address: string, data: DhtFindNodePacket) => void, getKademliaInstance: () => SearchKademlia | null): Promise<string | null> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return null;

    const ALPHA = 3;
    const K = 20;
    const QUERY_TIMEOUT = 5000;
    const TOTAL_TIMEOUT = 30000;
    const MAX_ITERATIONS = 10;

    const startTime = Date.now();
    let iteration = 0;
    const queriedAddresses = new Set<string>();
    const candidates: Array<{ upeerId: string, address: string, publicKey: string, nodeId: Buffer }> = [];
    const addressToContact = new Map<string, KademliaContact | KademliaContactInfo>();

    const initialContacts = kademlia.findClosestContacts(upeerId, K);
    for (const contact of initialContacts) {
        if (!contact.address || !contact.upeerId) continue;
        candidates.push({
            upeerId: contact.upeerId,
            address: contact.address,
            publicKey: contact.publicKey || '',
            nodeId: contact.nodeId || Buffer.from(contact.upeerId, 'hex')
        });
        addressToContact.set(contact.address, contact);
    }

    function xorDistance(idA: string, idB: string): bigint {
        try {
            return BigInt('0x' + idA) ^ BigInt('0x' + idB);
        } catch {
            return BigInt(0);
        }
    }

    function sortCandidates(): void {
        candidates.sort((a, b) => {
            const distA = xorDistance(a.upeerId, upeerId);
            const distB = xorDistance(b.upeerId, upeerId);
            return distA < distB ? -1 : distA > distB ? 1 : 0;
        });
    }

    sortCandidates();

    while (iteration < MAX_ITERATIONS && Date.now() - startTime < TOTAL_TIMEOUT) {
        iteration++;

        const toQuery = [];
        for (const cand of candidates) {
            if (toQuery.length >= ALPHA) break;
            if (!queriedAddresses.has(cand.address)) {
                toQuery.push(cand);
                queriedAddresses.add(cand.address);
            }
        }

        if (toQuery.length === 0) break;

        const promises = toQuery.map(contact => {
            return new Promise<{ nodes: KademliaContactInfo[], senderAddress: string }>((resolve, reject) => {
                const queryId = randomBytes(16).toString('hex');
                const timeout = setTimeout(() => {
                    reject(new Error(`Query timeout for ${contact.address}`));
                }, QUERY_TIMEOUT);

                pendingQueries.set(queryId, {
                    resolve: (value) => {
                        clearTimeout(timeout);
                        if ('nodes' in value) {
                            resolve(value);
                            return;
                        }
                        reject(new Error('Unexpected DHT query result type'));
                    },
                    reject: (error) => {
                        clearTimeout(timeout);
                        pendingQueries.delete(queryId);
                        reject(error);
                    },
                    type: 'DHT_FIND_NODE',
                    targetId: upeerId,
                    timestamp: Date.now(),
                    timeoutId: timeout
                });

                const packet: DhtFindNodePacket = {
                    type: 'DHT_FIND_NODE',
                    targetId: upeerId,
                    queryId
                };

                sendMessage(contact.address, packet);
            });
        });

        const results = await Promise.allSettled(promises);
        for (const result of results) {
            if (result.status !== 'fulfilled') {
                continue;
            }

            const { nodes } = result.value;
            if (!nodes || !Array.isArray(nodes)) continue;
            for (const node of nodes) {
                if (!node.upeerId || !node.address || !node.publicKey) continue;
                if (node.upeerId === upeerId) {
                    return node.address;
                }
                if (!addressToContact.has(node.address)) {
                    candidates.push({
                        upeerId: node.upeerId,
                        address: node.address,
                        publicKey: node.publicKey,
                        nodeId: node.nodeId ? Buffer.from(node.nodeId, 'hex') : Buffer.from(node.upeerId, 'hex')
                    });
                    addressToContact.set(node.address, node);
                }
            }
        }

        sortCandidates();
    }

    return null;
}

export async function performDhtMaintenance(getKademliaInstance: () => MaintenanceKademlia | null): Promise<void> {
    const kademlia = getKademliaInstance();
    if (kademlia) {
        kademlia.performMaintenance();
        try {
            await performAutoRenewal(getKademliaInstance);
        } catch (err) {
            error('Auto-renewal failed', err, 'dht');
        }
    }
}
