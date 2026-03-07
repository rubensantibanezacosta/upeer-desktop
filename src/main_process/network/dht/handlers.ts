import { BrowserWindow } from 'electron';
import { KademliaDHT } from './kademlia/index.js';
import { getContactByRevelnestId, updateContactDhtLocation } from '../../storage/db.js';
import { verifyLocationBlock, verifyLocationBlockWithDHT, validateDhtSequence, storeRenewalTokenInDHT, renewLocationBlock, canRenewLocationBlock, verifyRenewalToken } from '../utils.js';
import { network, security, warn, error } from '../../security/secure-logger.js';
import { setKademliaInstance, getKademliaInstance } from './shared.js';

// Re-export shared functions
export { setKademliaInstance, getKademliaInstance };

// Handle incoming DHT messages (called from main packet handler)
export async function handleDhtPacket(
    type: string,
    data: any,
    senderRevelnestId: string,
    senderAddress: string,
    win: BrowserWindow | null,
    sendResponse: (ip: string, data: any) => void
): Promise<boolean> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return false;

    try {
        // Handle legacy DHT messages (for backward compatibility)
        if (type === 'DHT_UPDATE') {
            await handleLegacyDhtUpdate(senderRevelnestId, data, win);
            return true;
        }
        
        if (type === 'DHT_EXCHANGE') {
            await handleLegacyDhtExchange(senderRevelnestId, data);
            return true;
        }
        
        if (type === 'DHT_QUERY') {
            await handleLegacyDhtQuery(senderRevelnestId, data, senderAddress, sendResponse);
            return true;
        }
        
        if (type === 'DHT_RESPONSE') {
            await handleLegacyDhtResponse(senderRevelnestId, data, sendResponse);
            return true;
        }

        // Handle Kademlia DHT messages
        if (type.startsWith('DHT_')) {
            const response = await kademlia.handleMessage(senderRevelnestId, data, senderAddress);
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
async function handleLegacyDhtUpdate(senderRevelnestId: string, data: any, win: BrowserWindow | null) {
    const block = data.locationBlock;
    if (!block || typeof block.dhtSeq !== 'number' || !block.address || !block.signature) return;

    const contact = await getContactByRevelnestId(senderRevelnestId);
    if (!contact || !contact.publicKey) return;

    const isValid = await verifyLocationBlockWithDHT(senderRevelnestId, block, contact.publicKey);
    if (!isValid) {
        security('Invalid DHT_UPDATE signature', { revelnestId: senderRevelnestId }, 'dht');
        return;
    }

    const currentSeq = contact.dhtSeq || 0;
    const seqValidation = validateDhtSequence(currentSeq, block.dhtSeq);
    
    if (!seqValidation.valid) {
        if (seqValidation.requiresPoW) {
            // TODO: Implement PoW verification for large sequence jumps
            security('Large sequence jump, PoW required', { revelnestId: senderRevelnestId, jump: block.dhtSeq - currentSeq }, 'dht');
            return;
        } else {
            security('Invalid sequence', { revelnestId: senderRevelnestId, reason: seqValidation.reason }, 'dht');
            return;
        }
    }
    
    network('Updating location (legacy)', undefined, { revelnestId: senderRevelnestId, address: block.address, dhtSeq: block.dhtSeq }, 'dht-legacy');
    updateContactDhtLocation(senderRevelnestId, block.address, block.dhtSeq, block.signature, block.expiresAt, block.renewalToken);
    
    // Store renewal token in DHT for distributed access
    if (block.renewalToken) {
        storeRenewalTokenInDHT(block.renewalToken).catch(err => {
            console.error('Failed to store renewal token in DHT:', err);
        });
    }
    
    // Log renewal token if present
    if (block.renewalToken) {
        network('Received renewal token', undefined, { targetId: senderRevelnestId }, 'dht-renewal');
    }
    
    // Also store in Kademlia DHT
    const kademlia = getKademliaInstance();
    if (kademlia) {
        await kademlia.storeLocationBlock(senderRevelnestId, block);
    }
}

async function handleLegacyDhtExchange(senderRevelnestId: string, data: any) {
    if (!Array.isArray(data.peers)) return;
    network('Receiving locations (legacy)', undefined, { revelnestId: senderRevelnestId, count: data.peers.length }, 'dht-legacy');

    for (const peer of data.peers) {
        if (!peer.revelnestId || !peer.publicKey || !peer.locationBlock) continue;
        if (peer.revelnestId === senderRevelnestId) continue;

        const existing = await getContactByRevelnestId(peer.revelnestId);
        if (!existing) continue;

        const block = peer.locationBlock;
        if (typeof block.dhtSeq !== 'number' || !block.address || !block.signature) continue;

        const isValid = await verifyLocationBlockWithDHT(peer.revelnestId, block, existing.publicKey);
        if (!isValid) {
            security('Invalid PEEREX signature', { peerId: peer.revelnestId }, 'dht');
            continue;
        }

        const currentSeq = existing.dhtSeq || 0;
        const seqValidation = validateDhtSequence(currentSeq, block.dhtSeq);
        
        if (!seqValidation.valid) {
            if (seqValidation.requiresPoW) {
                // TODO: Implement PoW verification for large sequence jumps
                security('Large sequence jump, PoW required', { peerId: peer.revelnestId, jump: block.dhtSeq - currentSeq }, 'dht');
                continue;
            } else {
                security('Invalid sequence', { peerId: peer.revelnestId, reason: seqValidation.reason }, 'dht');
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
                    { peerId: peer.revelnestId, renewalsUsed: finalRenewalToken.renewalsUsed }, 
                    'dht-renewal');
            }
        }

        updateContactDhtLocation(peer.revelnestId, finalBlock.address, finalBlock.dhtSeq, finalBlock.signature, finalBlock.expiresAt, finalRenewalToken);
        
        // Store renewal token in DHT for distributed access
        if (finalRenewalToken) {
            storeRenewalTokenInDHT(finalRenewalToken).catch(err => {
                console.error('Failed to store renewal token in DHT:', err);
            });
        }
        
        // Log renewal token if present
        if (finalRenewalToken) {
            network('Received renewal token via exchange', undefined, { peerId: peer.revelnestId }, 'dht-renewal');
        }
    }
}

async function handleLegacyDhtQuery(
    senderRevelnestId: string, 
    data: any, 
    fromAddress: string, 
    sendResponse: (ip: string, data: any) => void
) {
    network('Searching for target (legacy)', undefined, { 
        requester: senderRevelnestId, 
        target: data.targetId,
        referralContext: data.referralContext
    }, 'dht-legacy');
    const target = await getContactByRevelnestId(data.targetId);

    let responseData: any = { type: 'DHT_RESPONSE', targetId: data.targetId };

    if (target && target.dhtSignature) {
        responseData.locationBlock = {
            address: target.address,
            dhtSeq: target.dhtSeq,
            signature: target.dhtSignature,
            expiresAt: target.expiresAt,
            renewalToken: target.renewalToken
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
    }
    }

    sendResponse(fromAddress, responseData);
}

async function handleLegacyDhtResponse(
    senderRevelnestId: string, 
    data: any, 
    sendResponse: (ip: string, data: any) => void
) {
    if (data.locationBlock) {
        const block = data.locationBlock;
        const existing = await getContactByRevelnestId(data.targetId);
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
                    console.error('Failed to store renewal token in DHT:', err);
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
    await kademlia.storeLocationBlock(kademlia['revelnestId'], locationBlock);
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
                    const contact = await getContactByRevelnestId(storedValue.publisher);
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

export async function findNodeLocation(revelnestId: string): Promise<string | null> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return null;
    
    const locationBlock = await kademlia.findLocationBlock(revelnestId);
    return locationBlock?.address || null;
}

export async function iterativeFindNode(revelnestId: string, sendMessage: (address: string, data: any) => void): Promise<string | null> {
    const kademlia = getKademliaInstance();
    if (!kademlia) return null;
    
    // Get Kademlia instance to use its methods
    const kademliaInstance = kademlia as any;
    
    // Find closest contacts to the target
    const closestContacts = kademliaInstance.findClosestContacts(revelnestId, 3);
    
    for (const contact of closestContacts) {
        try {
            // Send FIND_NODE query
            sendMessage(contact.address, {
                type: 'DHT_FIND_NODE',
                targetId: revelnestId
            });
            
            // TODO: Implement proper iterative find with timeout and parallel queries
            // This is simplified for now
        } catch (error) {
            warn('Failed to query contact', { contactId: contact.revelnestId, error }, 'kademlia');
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
            console.error('Auto-renewal failed:', err);
        }
    }
}