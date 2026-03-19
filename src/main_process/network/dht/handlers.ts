import { BrowserWindow } from 'electron';
import { randomBytes } from 'node:crypto';

import { getContactByUpeerId } from '../../storage/contacts/operations.ts';
import { updateContactDhtLocation } from '../../storage/contacts/location.ts';
import { verifyLocationBlockWithDHT, validateDhtSequence, storeRenewalTokenInDHT, renewLocationBlock, canRenewLocationBlock, verifyRenewalToken } from '../utils.js';
import { network, security, error } from '../../security/secure-logger.js';
import { AdaptivePow } from '../../security/pow.js';
import { setKademliaInstance, getKademliaInstance } from './shared.js';

// Re-export shared functions
export { setKademliaInstance, getKademliaInstance };

// Pending queries for iterative search
const pendingQueries = new Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    type: string;
    targetId: string;
    timestamp: number;
    timeoutId?: NodeJS.Timeout;
}>();

// Cleanup old pending queries
export function cleanupPendingQueries() {
    const now = Date.now();
    const timeout = 30000; // 30 seconds
    for (const [queryId, query] of pendingQueries.entries()) {
        if (now - query.timestamp > timeout) {
            query.reject(new Error('Query timeout'));
            pendingQueries.delete(queryId);
        }
    }
}

// Handle DHT_FOUND_NODES and DHT_FOUND_VALUE responses
export function handleDhtFoundNodes(data: any, senderAddress: string) {
    if (data.queryId) {
        const query = pendingQueries.get(data.queryId);
        if (query) {
            if (query.timeoutId) clearTimeout(query.timeoutId);
            pendingQueries.delete(data.queryId);
            query.resolve({ nodes: data.nodes, senderAddress });
        }
    }
    // Also add received nodes to routing table
    const kademlia = getKademliaInstance();
    if (kademlia && data.nodes) {
        const kademliaInstance = kademlia as any;
        for (const node of data.nodes) {
            if (node.upeerId && node.address && node.publicKey) {
                // Add or update contact in routing table
                kademliaInstance.updateContactFromMessage?.(node.upeerId, node.address);
            }
        }
    }
}

export function handleDhtFoundValue(data: any, senderAddress: string) {
    if (data.queryId) {
        const query = pendingQueries.get(data.queryId);
        if (query) {
            if (query.timeoutId) clearTimeout(query.timeoutId);
            pendingQueries.delete(data.queryId);
            query.resolve({ value: data.value, senderAddress });
        }
    }
}

export { pendingQueries };

// Handle incoming DHT messages (called from main packet handler)
export async function handleDhtPacket(
    type: string,
    data: any,
    senderUpeerId: string,
    senderAddress: string,
    win: BrowserWindow | null,
    _sendResponse: (ip: string, data: any) => void
): Promise<boolean> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return false;

    try {
        // Handle DHT messages
        if (type === 'DHT_UPDATE') {
            await handleDhtUpdate(senderUpeerId, data, win);
            return true;
        }

        if (type === 'DHT_EXCHANGE') {
            await handleDhtExchange(senderUpeerId, data);
            return true;
        }

        if (type === 'DHT_QUERY') {
            await handleDhtQuery(senderUpeerId, data, senderAddress, _sendResponse);
            return true;
        }

        if (type === 'DHT_RESPONSE') {
            await handleDhtResponse(senderUpeerId, data, _sendResponse);
            return true;
        }

        // Handle response types
        if (type === 'DHT_FOUND_NODES') {
            handleDhtFoundNodes(data, senderAddress);
            return true;
        }
        if (type === 'DHT_FOUND_VALUE') {
            handleDhtFoundValue(data, senderAddress);
            return true;
        }

        // Handle Kademlia DHT messages
        if (type.startsWith('DHT_')) {
            const response = await kademlia.handleMessage(senderUpeerId, data, senderAddress);
            if (response) {
                _sendResponse(senderAddress, response);
            }
            return true;
        }
    } catch (err) {
        error(`Error handling ${type}`, err, 'dht');
    }

    return false;
}

// DHT handlers
async function handleDhtUpdate(senderUpeerId: string, data: any, _win: BrowserWindow | null) {
    const block = data.locationBlock;
    if (!block || typeof block.dhtSeq !== 'number' || !block.address || !block.signature) return;

    const contact = await getContactByUpeerId(senderUpeerId);
    if (!contact || !contact.publicKey) return;

    const isValid = await verifyLocationBlockWithDHT(senderUpeerId, block, contact.publicKey);
    if (!isValid) {
        security('Invalid DHT_UPDATE signature', { upeerId: senderUpeerId }, 'dht');
        return;
    }

    const currentSeq = contact.dhtSeq || 0;
    const seqValidation = validateDhtSequence(currentSeq, block.dhtSeq);

    if (!seqValidation.valid) {
        if (seqValidation.requiresPoW) {
            // PoW verification for large sequence jumps
            if (!block.powProof || typeof block.powProof !== 'string') {
                security('Large sequence jump requires powProof', { upeerId: senderUpeerId, jump: block.dhtSeq - currentSeq }, 'dht');
                return;
            }
            if (!AdaptivePow.verifyLightProof(block.powProof, senderUpeerId)) {
                security('Invalid PoW proof for large sequence jump', { upeerId: senderUpeerId, jump: block.dhtSeq - currentSeq }, 'dht');
                return;
            }
            // PoW verified, continue processing
        } else {
            security('Invalid sequence', { upeerId: senderUpeerId, reason: seqValidation.reason }, 'dht');
            return;
        }
    }

    if (seqValidation.reason === 'Sequence identical') {
        return; // Silent skip for identical sequence
    }

    network('Updating location', undefined, { upeerId: senderUpeerId, address: block.address, addresses: block.addresses, dhtSeq: block.dhtSeq }, 'dht');
    updateContactDhtLocation(senderUpeerId, block.addresses || block.address, block.dhtSeq, block.signature, block.expiresAt, block.renewalToken);

    // Store renewal token in DHT for distributed access
    if (block.renewalToken) {
        storeRenewalTokenInDHT(block.renewalToken).catch(err => {
            error('Failed to store renewal token in DHT', err, 'dht-renewal');
        });
    }

    // Log renewal token if present
    if (block.renewalToken) {
        network('Received renewal token', undefined, { targetId: senderUpeerId }, 'dht-renewal');
    }

    // Also store in Kademlia DHT
    const kademlia = getKademliaInstance();
    if (kademlia) {
        await kademlia.storeLocationBlock(senderUpeerId, block);
    }
}

async function handleDhtExchange(senderUpeerId: string, data: any) {
    if (!Array.isArray(data.peers)) return;
    network('Receiving locations', undefined, { upeerId: senderUpeerId, count: data.peers.length }, 'dht');

    for (const peer of data.peers) {
        if (!peer.upeerId || !peer.publicKey || !peer.locationBlock) continue;
        if (peer.upeerId === senderUpeerId) continue;

        const existing = await getContactByUpeerId(peer.upeerId);
        if (!existing) continue;

        const block = peer.locationBlock;
        if (typeof block.dhtSeq !== 'number' || !block.address || !block.signature) continue;

        const isValid = await verifyLocationBlockWithDHT(peer.upeerId, block, existing.publicKey);
        if (!isValid) {
            security('Invalid PEEREX signature', {
                peerId: peer.upeerId,
                usedPublicKey: existing.publicKey?.slice(0, 10) + '...',
                packetPublicKey: peer.publicKey?.slice(0, 10) + '...'
            }, 'dht');
            continue;
        }

        const currentSeq = existing.dhtSeq || 0;
        const seqValidation = validateDhtSequence(currentSeq, block.dhtSeq);

        if (!seqValidation.valid) {
            if (seqValidation.requiresPoW) {
                // PoW verification for large sequence jumps
                if (!block.powProof || typeof block.powProof !== 'string') {
                    security('Large sequence jump requires powProof', { peerId: peer.upeerId, jump: block.dhtSeq - currentSeq }, 'dht');
                    continue;
                }
                if (!AdaptivePow.verifyLightProof(block.powProof, peer.upeerId)) {
                    security('Invalid PoW proof for large sequence jump', { peerId: peer.upeerId, jump: block.dhtSeq - currentSeq }, 'dht');
                    continue;
                }
                // PoW verified, continue processing
            } else {
                security('Invalid sequence', { peerId: peer.upeerId, reason: seqValidation.reason }, 'dht');
                continue;
            }
        }

        if (seqValidation.reason === 'Sequence identical') {
            continue; // Silent skip for identical sequence
        }

        let finalBlock = block;
        let finalRenewalToken = block.renewalToken;

        // Check if block can be renewed (has valid renewal token and is near expiration)
        if (existing.publicKey && canRenewLocationBlock(block, existing.publicKey)) {
            const renewed = renewLocationBlock(block, existing.publicKey);
            if (renewed) {
                finalBlock = renewed;
                finalRenewalToken = renewed.renewalToken;
                network('Renewed location block via DHT exchange', undefined,
                    { peerId: peer.upeerId, renewalsUsed: finalRenewalToken.renewalsUsed },
                    'dht-renewal');
            }
        }

        updateContactDhtLocation(peer.upeerId, finalBlock.addresses || finalBlock.address, finalBlock.dhtSeq, finalBlock.signature, finalBlock.expiresAt, finalRenewalToken);

        // Store renewal token in DHT for distributed access
        if (finalRenewalToken) {
            storeRenewalTokenInDHT(finalRenewalToken).catch(err => {
                error('Failed to store renewal token in DHT', err, 'dht-renewal');
            });
        }

        // Log renewal token if present
        if (finalRenewalToken) {
            network('Received renewal token via exchange', undefined, { peerId: peer.upeerId }, 'dht-renewal');
        }
    }
}

async function handleDhtQuery(
    senderUpeerId: string,
    data: any,
    fromAddress: string,
    sendResponse: (ip: string, data: any) => void
) {
    network('Searching for target', undefined, {
        requester: senderUpeerId,
        target: data.targetId,
        referralContext: data.referralContext
    }, 'dht');
    const target = await getContactByUpeerId(data.targetId);

    const responseData: any = { type: 'DHT_RESPONSE', targetId: data.targetId };

    if (target && target.dhtSignature) {
        responseData.locationBlock = {
            address: target.address,
            dhtSeq: target.dhtSeq,
            signature: target.dhtSignature,
            // BUG BP fix: campo Drizzle es dhtExpiresAt, no expiresAt.
            // renewalToken se guarda como JSON string en DB → parsear al leer.
            expiresAt: target.dhtExpiresAt,
            renewalToken: target.renewalToken
                ? (() => { try { return JSON.parse(target.renewalToken); } catch { return undefined; } })()
                : undefined
        };
        responseData.publicKey = target.publicKey;
    } else {
        const kademlia = getKademliaInstance();
        if (kademlia) {
            // Try to find in Kademlia DHT
            const locationBlock = await kademlia.findLocationBlock(data.targetId);
            if (locationBlock) {
                responseData.locationBlock = locationBlock;
            }
            // BUG AZ fix: si el target no se encontró ni localmente ni en Kademlia,
            // enviar los K nodos más cercanos como vecinos para que el solicitante
            // pueda continuar el enrutamiento iterativo. Sin esta respuesta, la búsqueda
            // DHT moría en un dead-end con una respuesta vacía {type, targetId}.
            if (!responseData.locationBlock) {
                const kInst = kademlia as any;
                if (typeof kInst.findClosestContacts === 'function') {
                    const closest: any[] = kInst.findClosestContacts(data.targetId, 5);
                    const neighbors = closest
                        .filter(c => c.upeerId !== senderUpeerId && c.publicKey)
                        .map(c => ({ upeerId: c.upeerId, address: c.address, publicKey: c.publicKey }));
                    if (neighbors.length > 0) responseData.neighbors = neighbors;
                }
            }
        }
    }

    sendResponse(fromAddress, responseData);
}

async function handleDhtResponse(
    senderUpeerId: string,
    data: any,
    _sendResponse: (ip: string, data: any) => void
) {
    if (data.locationBlock) {
        const block = data.locationBlock;
        const existing = await getContactByUpeerId(data.targetId);
        if (!existing) return;

        const isValid = await verifyLocationBlockWithDHT(data.targetId, block, existing.publicKey || data.publicKey);
        if (isValid && block.dhtSeq > (existing.dhtSeq || 0)) {
            network('Found new IP', undefined, { target: data.targetId, address: block.address }, 'dht');

            let finalBlock = block;
            let finalRenewalToken = block.renewalToken;

            // Check if block can be renewed (has valid renewal token and is near expiration)
            if (existing.publicKey && canRenewLocationBlock(block, existing.publicKey)) {
                const renewed = renewLocationBlock(block, existing.publicKey);
                if (renewed) {
                    finalBlock = renewed;
                    finalRenewalToken = renewed.renewalToken;
                    network('Renewed location block via legacy DHT', undefined,
                        { targetId: data.targetId, renewalsUsed: finalRenewalToken.renewalsUsed },
                        'dht-renewal');
                }
            }

            updateContactDhtLocation(data.targetId, finalBlock.addresses || finalBlock.address, finalBlock.dhtSeq, finalBlock.signature, finalBlock.expiresAt, finalRenewalToken);

            // Store renewal token in DHT for distributed access
            if (finalRenewalToken) {
                storeRenewalTokenInDHT(finalRenewalToken).catch(err => {
                    error('Failed to store renewal token in DHT', err, 'dht-renewal');
                });
            }
        }
    }
}

// New DHT functions using Kademlia
export async function publishLocationBlock(locationBlock: any): Promise<void> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return;

    await kademlia.storeLocationBlock(kademlia['upeerId'], locationBlock);
    network('Published location block to Kademlia', undefined, {
        dhtSeq: locationBlock.dhtSeq,
        hasRenewalToken: !!locationBlock.renewalToken,
        addresses: locationBlock.addresses?.length || 1
    }, 'kademlia');
}

// Auto-renewal function for delegated renewal
export async function performAutoRenewal(): Promise<void> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return;

    const kademliaInstance = kademlia as any;
    const store = kademliaInstance.getValueStore();

    if (!store || !store.getAll) return;

    const allValues = store.getAll();
    const now = Date.now();
    const renewalThreshold = 3 * 24 * 60 * 60 * 1000; // 3 days

    for (const storedValue of allValues) {
        if (!storedValue.value || !storedValue.value.expiresAt) continue;

        const timeToExpire = storedValue.value.expiresAt - now;
        if (timeToExpire < renewalThreshold && timeToExpire > 0) {
            // Block is close to expiration, check for renewal token
            if (storedValue.value.renewalToken) {
                const token = storedValue.value.renewalToken;
                if (token.allowedUntil > now && token.renewalsUsed < token.maxRenewals) {
                    // BUG BA fix: verificar firma Ed25519 del renewal token ANTES de mutarlo
                    // o re-almacenarlo. Sin esta verificación, un atacante podía inyectar
                    // en la Kademlia store un bloque falso con renewalsUsed=0, maxRenewals=999
                    // y obtener auto-renewal indefinido en cualquier nodo que ejecutase el
                    // mantenimiento DHT — sin ser jamás el titular legítimo del nodo.
                    const publisherContact = await getContactByUpeerId(storedValue.publisher);
                    if (!publisherContact?.publicKey) continue;
                    if (!verifyRenewalToken(token, publisherContact.publicKey)) {
                        security('Auto-renewal rejected: invalid renewal token signature', { publisher: storedValue.publisher }, 'dht');
                        continue;
                    }

                    // Auto-renew the block
                    const renewedBlock = { ...storedValue.value };
                    renewedBlock.expiresAt = now + (30 * 24 * 60 * 60 * 1000); // Extend 30 days
                    token.renewalsUsed += 1;

                    // Update in DHT
                    await kademlia.storeLocationBlock(storedValue.publisher, renewedBlock);
                    network('Auto-renewed location block', undefined, {
                        targetId: storedValue.publisher,
                        renewalsUsed: token.renewalsUsed
                    }, 'auto-renewal');

                    // Also update local contact database if contact exists
                    const contact = await getContactByUpeerId(storedValue.publisher);
                    if (contact) {
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
        }
    }
}

export async function findNodeLocation(upeerId: string): Promise<any | null> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return null;

    const locationBlock = await kademlia.findLocationBlock(upeerId);
    return locationBlock || null;
}

export async function iterativeFindNode(upeerId: string, sendMessage: (address: string, data: any) => void): Promise<string | null> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return null;

    const kademliaInstance = kademlia as any;
    const ALPHA = 3; // concurrency parameter
    const K = 20; // bucket size
    const QUERY_TIMEOUT = 5000; // 5 seconds per query
    const TOTAL_TIMEOUT = 30000; // 30 seconds total
    const MAX_ITERATIONS = 10;

    const startTime = Date.now();
    let iteration = 0;

    // Set of already queried node addresses to avoid duplicates
    const queriedAddresses = new Set<string>();
    // List of candidate contacts (sorted by distance to target)
    const candidates: Array<{ upeerId: string, address: string, publicKey: string, nodeId: Buffer }> = [];
    // Map of address to contact info
    const addressToContact = new Map<string, any>();

    // Initialize candidates with closest contacts from routing table
    const initialContacts = kademliaInstance.findClosestContacts(upeerId, K);
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

    // Helper to calculate XOR distance between two IDs (as hex strings)
    function xorDistance(idA: string, idB: string): bigint {
        try {
            return BigInt('0x' + idA) ^ BigInt('0x' + idB);
        } catch {
            return BigInt(0);
        }
    }

    // Sort candidates by distance to target (closest first)
    function sortCandidates() {
        candidates.sort((a, b) => {
            const distA = xorDistance(a.upeerId, upeerId);
            const distB = xorDistance(b.upeerId, upeerId);
            return distA < distB ? -1 : distA > distB ? 1 : 0;
        });
    }

    sortCandidates();

    while (iteration < MAX_ITERATIONS && Date.now() - startTime < TOTAL_TIMEOUT) {
        iteration++;

        // Select α closest candidates that haven't been queried yet
        const toQuery = [];
        for (const cand of candidates) {
            if (toQuery.length >= ALPHA) break;
            if (!queriedAddresses.has(cand.address)) {
                toQuery.push(cand);
                queriedAddresses.add(cand.address);
            }
        }

        if (toQuery.length === 0) {
            // No new candidates to query
            break;
        }

        // Send parallel queries
        const promises = toQuery.map(contact => {
            return new Promise<{ nodes: any[], senderAddress: string }>((resolve, reject) => {
                const queryId = randomBytes(16).toString('hex');
                const timeout = setTimeout(() => {
                    reject(new Error(`Query timeout for ${contact.address}`));
                }, QUERY_TIMEOUT);

                pendingQueries.set(queryId, {
                    resolve: (value) => {
                        clearTimeout(timeout);
                        resolve(value);
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

                // Send FIND_NODE query with queryId
                sendMessage(contact.address, {
                    type: 'DHT_FIND_NODE',
                    targetId: upeerId,
                    queryId
                });
            });
        });

        // Wait for all queries to complete (or timeout)
        const results = await Promise.allSettled(promises);

        // Process successful responses
        for (const result of results) {
            if (result.status === 'fulfilled') {
                const { nodes, senderAddress: _senderAddress } = result.value;
                // Add new nodes to candidates
                if (nodes && Array.isArray(nodes)) {
                    for (const node of nodes) {
                        if (!node.upeerId || !node.address || !node.publicKey) continue;
                        if (node.upeerId === upeerId) {
                            // Found the target node
                            return node.address;
                        }
                        // Add to candidates if not already present
                        const key = node.address;
                        if (!addressToContact.has(key)) {
                            candidates.push({
                                upeerId: node.upeerId,
                                address: node.address,
                                publicKey: node.publicKey,
                                nodeId: node.nodeId ? Buffer.from(node.nodeId, 'hex') : Buffer.from(node.upeerId, 'hex')
                            });
                            addressToContact.set(key, node);
                        }
                    }
                }
            } else {
                // Query failed (timeout or error)
                // Optionally mark contact as bad (not implemented)
            }
        }

        // Sort candidates again (new nodes added)
        sortCandidates();

        // If we have K closest candidates and no new closer nodes found, stop
        // For simplicity, continue until iterations or timeout
    }

    // If we found the target, would have returned earlier
    // Otherwise, return null (not found)
    return null;
}

// Maintenance function
export async function performDhtMaintenance(): Promise<void> {
    const kademlia = getKademliaInstance();
    if (kademlia) {
        kademlia.performMaintenance();
        // Perform auto-renewal of location blocks with renewal tokens
        try {
            await performAutoRenewal();
        } catch (err) {
            error('Auto-renewal failed', err, 'dht');
        }
    }
}