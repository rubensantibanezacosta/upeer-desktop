import { BrowserWindow } from 'electron';
import { KademliaDHT } from './kademlia/index.js';
import { getContactByUpeerId, updateContactDhtLocation } from '../../storage/db.js';
import { verifyLocationBlock, verifyLocationBlockWithDHT, validateDhtSequence, storeRenewalTokenInDHT, renewLocationBlock, canRenewLocationBlock, verifyRenewalToken } from '../utils.js';
import { network, security, warn, error } from '../../security/secure-logger.js';
import { setKademliaInstance, getKademliaInstance } from './shared.js';

// Re-export shared functions
export { setKademliaInstance, getKademliaInstance };

// Handle incoming DHT messages (called from main packet handler)
export async function handleDhtPacket(
    type: string,
    data: any,
    senderUpeerId: string,
    senderAddress: string,
    win: BrowserWindow | null,
    sendResponse: (ip: string, data: any) => void
): Promise<boolean> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return false;

    try {
        // Handle legacy DHT messages (for backward compatibility)
        if (type === 'DHT_UPDATE') {
            await handleLegacyDhtUpdate(senderUpeerId, data, win);
            return true;
        }

        if (type === 'DHT_EXCHANGE') {
            await handleLegacyDhtExchange(senderUpeerId, data);
            return true;
        }

        if (type === 'DHT_QUERY') {
            await handleLegacyDhtQuery(senderUpeerId, data, senderAddress, sendResponse);
            return true;
        }

        if (type === 'DHT_RESPONSE') {
            await handleLegacyDhtResponse(senderUpeerId, data, sendResponse);
            return true;
        }

        // Handle Kademlia DHT messages
        if (type.startsWith('DHT_')) {
            const response = await kademlia.handleMessage(senderUpeerId, data, senderAddress);
            if (response) {
                sendResponse(senderAddress, response);
            }
            return true;
        }
    } catch (err) {
        error(`Error handling ${type}`, err, 'dht');
    }

    return false;
}

// Legacy DHT handlers (for backward compatibility during migration)
async function handleLegacyDhtUpdate(senderUpeerId: string, data: any, win: BrowserWindow | null) {
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
            // TODO: Implement PoW verification for large sequence jumps
            security('Large sequence jump, PoW required', { upeerId: senderUpeerId, jump: block.dhtSeq - currentSeq }, 'dht');
            return;
        } else {
            security('Invalid sequence', { upeerId: senderUpeerId, reason: seqValidation.reason }, 'dht');
            return;
        }
    }

    network('Updating location (legacy)', undefined, { upeerId: senderUpeerId, address: block.address, dhtSeq: block.dhtSeq }, 'dht-legacy');
    updateContactDhtLocation(senderUpeerId, block.address, block.dhtSeq, block.signature, block.expiresAt, block.renewalToken);

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

async function handleLegacyDhtExchange(senderUpeerId: string, data: any) {
    if (!Array.isArray(data.peers)) return;
    network('Receiving locations (legacy)', undefined, { upeerId: senderUpeerId, count: data.peers.length }, 'dht-legacy');

    for (const peer of data.peers) {
        if (!peer.upeerId || !peer.publicKey || !peer.locationBlock) continue;
        if (peer.upeerId === senderUpeerId) continue;

        const existing = await getContactByUpeerId(peer.upeerId);
        if (!existing) continue;

        const block = peer.locationBlock;
        if (typeof block.dhtSeq !== 'number' || !block.address || !block.signature) continue;

        const isValid = await verifyLocationBlockWithDHT(peer.upeerId, block, existing.publicKey);
        if (!isValid) {
            security('Invalid PEEREX signature', { peerId: peer.upeerId }, 'dht');
            continue;
        }

        const currentSeq = existing.dhtSeq || 0;
        const seqValidation = validateDhtSequence(currentSeq, block.dhtSeq);

        if (!seqValidation.valid) {
            if (seqValidation.requiresPoW) {
                // TODO: Implement PoW verification for large sequence jumps
                security('Large sequence jump, PoW required', { peerId: peer.upeerId, jump: block.dhtSeq - currentSeq }, 'dht');
                continue;
            } else {
                security('Invalid sequence', { peerId: peer.upeerId, reason: seqValidation.reason }, 'dht');
                continue;
            }
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

        updateContactDhtLocation(peer.upeerId, finalBlock.address, finalBlock.dhtSeq, finalBlock.signature, finalBlock.expiresAt, finalRenewalToken);

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

async function handleLegacyDhtQuery(
    senderUpeerId: string,
    data: any,
    fromAddress: string,
    sendResponse: (ip: string, data: any) => void
) {
    network('Searching for target (legacy)', undefined, {
        requester: senderUpeerId,
        target: data.targetId,
        referralContext: data.referralContext
    }, 'dht-legacy');
    const target = await getContactByUpeerId(data.targetId);

    let responseData: any = { type: 'DHT_RESPONSE', targetId: data.targetId };

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

async function handleLegacyDhtResponse(
    senderUpeerId: string,
    data: any,
    sendResponse: (ip: string, data: any) => void
) {
    if (data.locationBlock) {
        const block = data.locationBlock;
        const existing = await getContactByUpeerId(data.targetId);
        if (!existing) return;

        const isValid = await verifyLocationBlockWithDHT(data.targetId, block, existing.publicKey || data.publicKey);
        if (isValid && block.dhtSeq > (existing.dhtSeq || 0)) {
            network('Found new IP (legacy)', undefined, { target: data.targetId, address: block.address }, 'dht-legacy');

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

            updateContactDhtLocation(data.targetId, finalBlock.address, finalBlock.dhtSeq, finalBlock.signature, finalBlock.expiresAt, finalRenewalToken);

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
export async function publishLocationBlock(address: string, dhtSeq: number, signature: string, renewalToken?: any): Promise<void> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return;

    const locationBlock = { address, dhtSeq, signature, renewalToken };
    await kademlia.storeLocationBlock(kademlia['upeerId'], locationBlock);
    network('Published location block', undefined, { dhtSeq, hasRenewalToken: !!renewalToken }, 'kademlia');
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
                            renewedBlock.address,
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

export async function findNodeLocation(upeerId: string): Promise<string | null> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return null;

    const locationBlock = await kademlia.findLocationBlock(upeerId);
    return locationBlock?.address || null;
}

export async function iterativeFindNode(upeerId: string, sendMessage: (address: string, data: any) => void): Promise<string | null> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return null;

    // Get Kademlia instance to use its methods
    const kademliaInstance = kademlia as any;

    // Find closest contacts to the target
    const closestContacts = kademliaInstance.findClosestContacts(upeerId, 3);

    for (const contact of closestContacts) {
        try {
            // Send FIND_NODE query
            sendMessage(contact.address, {
                type: 'DHT_FIND_NODE',
                targetId: upeerId
            });

            // TODO: Implement proper iterative find with timeout and parallel queries
            // This is simplified for now
        } catch (error) {
            warn('Failed to query contact', { contactId: contact.upeerId, error }, 'kademlia');
        }
    }

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