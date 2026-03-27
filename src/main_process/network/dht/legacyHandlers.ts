import { BrowserWindow } from 'electron';
import { getContactByUpeerId } from '../../storage/contacts/operations.ts';
import { updateContactDhtLocation } from '../../storage/contacts/location.ts';
import { verifyLocationBlockWithDHT, validateDhtSequence, storeRenewalTokenInDHT, renewLocationBlock, canRenewLocationBlock } from '../utils.js';
import { network, security, error } from '../../security/secure-logger.js';
import { AdaptivePow } from '../../security/pow.js';
import type { LocationBlock } from '../types.js';

type ContactRecord = {
    upeerId: string;
    address?: string;
    dhtSeq?: number;
    dhtSignature?: string;
    dhtExpiresAt?: number;
    renewalToken?: string;
    publicKey?: string;
    status?: string;
};

type DhtLocationBlock = LocationBlock & {
    powProof?: string;
};

type DhtUpdatePayload = {
    locationBlock?: DhtLocationBlock;
};

type DhtExchangePeer = {
    upeerId?: string;
    publicKey?: string;
    locationBlock?: DhtLocationBlock;
};

type DhtExchangePayload = {
    peers?: DhtExchangePeer[];
};

type DhtNeighbor = {
    upeerId: string;
    address: string;
    publicKey: string;
};

type DhtQueryPayload = {
    targetId?: string;
    referralContext?: unknown;
};

type DhtResponsePayload = {
    type: 'DHT_RESPONSE';
    targetId: string;
    publicKey?: string;
    locationBlock?: DhtLocationBlock;
    neighbors?: DhtNeighbor[];
};

type DhtResponseInput = {
    targetId?: string;
    publicKey?: string;
    locationBlock?: DhtLocationBlock;
    neighbors?: Array<{
        upeerId?: string;
        address?: string;
        publicKey?: string;
        locationBlock?: DhtLocationBlock;
    }>;
};

type LegacySendResponse = (ip: string, data: DhtResponsePayload | { type: 'DHT_QUERY'; targetId: string }) => void;

type KademliaLegacyLookup = {
    storeLocationBlock: (upeerId: string, block: DhtLocationBlock) => Promise<void>;
    findLocationBlock: (upeerId: string) => Promise<DhtLocationBlock | null>;
    findClosestContacts?: (targetId: string, count: number) => DhtNeighbor[];
};

export async function handleDhtUpdate(senderUpeerId: string, data: DhtUpdatePayload, getKademliaInstance: () => KademliaLegacyLookup | null, _win: BrowserWindow | null): Promise<void> {
    const block = data.locationBlock;
    if (!block || typeof block.dhtSeq !== 'number' || !block.address || !block.signature) return;

    const contact = await getContactByUpeerId(senderUpeerId) as ContactRecord | undefined;
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
            if (!block.powProof || typeof block.powProof !== 'string') {
                security('Large sequence jump requires powProof', { upeerId: senderUpeerId, jump: block.dhtSeq - currentSeq }, 'dht');
                return;
            }
            if (!AdaptivePow.verifyLightProof(block.powProof, senderUpeerId)) {
                security('Invalid PoW proof for large sequence jump', { upeerId: senderUpeerId, jump: block.dhtSeq - currentSeq }, 'dht');
                return;
            }
        } else {
            security('Invalid sequence', { upeerId: senderUpeerId, reason: seqValidation.reason }, 'dht');
            return;
        }
    }

    if (seqValidation.reason === 'Sequence identical') {
        return;
    }

    network('Updating location', undefined, { upeerId: senderUpeerId, address: block.address, addresses: block.addresses, dhtSeq: block.dhtSeq }, 'dht');
    updateContactDhtLocation(senderUpeerId, block.addresses || block.address, block.dhtSeq, block.signature, block.expiresAt, block.renewalToken);

    if (block.renewalToken) {
        storeRenewalTokenInDHT(block.renewalToken).catch(err => {
            error('Failed to store renewal token in DHT', err, 'dht-renewal');
        });
        network('Received renewal token', undefined, { targetId: senderUpeerId }, 'dht-renewal');
    }

    const kademlia = getKademliaInstance();
    if (kademlia) {
        await kademlia.storeLocationBlock(senderUpeerId, block);
    }
}

export async function handleDhtExchange(senderUpeerId: string, data: DhtExchangePayload): Promise<void> {
    if (!Array.isArray(data.peers)) return;
    network('Receiving locations', undefined, { upeerId: senderUpeerId, count: data.peers.length }, 'dht');

    for (const peer of data.peers) {
        if (!peer.upeerId || !peer.publicKey || !peer.locationBlock) continue;
        if (peer.upeerId === senderUpeerId) continue;

        const existing = await getContactByUpeerId(peer.upeerId) as ContactRecord | undefined;
        if (!existing) continue;

        const block = peer.locationBlock;
        if (typeof block.dhtSeq !== 'number' || !block.address || !block.signature) continue;

        if (!existing.publicKey) continue;

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
                if (!block.powProof || typeof block.powProof !== 'string') {
                    security('Large sequence jump requires powProof', { peerId: peer.upeerId, jump: block.dhtSeq - currentSeq }, 'dht');
                    continue;
                }
                if (!AdaptivePow.verifyLightProof(block.powProof, peer.upeerId)) {
                    security('Invalid PoW proof for large sequence jump', { peerId: peer.upeerId, jump: block.dhtSeq - currentSeq }, 'dht');
                    continue;
                }
            } else {
                security('Invalid sequence', { peerId: peer.upeerId, reason: seqValidation.reason }, 'dht');
                continue;
            }
        }

        if (seqValidation.reason === 'Sequence identical') continue;

        let finalBlock = block;
        let finalRenewalToken = block.renewalToken;
        if (existing.publicKey && canRenewLocationBlock(block, existing.publicKey)) {
            const renewed = renewLocationBlock(block, existing.publicKey);
            if (renewed) {
                finalBlock = renewed;
                finalRenewalToken = renewed.renewalToken;
                network('Renewed location block via DHT exchange', undefined, { peerId: peer.upeerId, renewalsUsed: renewed.renewalToken?.renewalsUsed }, 'dht-renewal');
            }
        }

        updateContactDhtLocation(peer.upeerId, finalBlock.addresses || finalBlock.address, finalBlock.dhtSeq, finalBlock.signature, finalBlock.expiresAt, finalRenewalToken);
        if (finalRenewalToken) {
            storeRenewalTokenInDHT(finalRenewalToken).catch(err => {
                error('Failed to store renewal token in DHT', err, 'dht-renewal');
            });
            network('Received renewal token via exchange', undefined, { peerId: peer.upeerId }, 'dht-renewal');
        }
    }
}

export async function handleDhtQuery(senderUpeerId: string, data: DhtQueryPayload, fromAddress: string, sendResponse: LegacySendResponse, getKademliaInstance: () => KademliaLegacyLookup | null): Promise<void> {
    if (typeof data.targetId !== 'string' || !data.targetId) {
        return;
    }

    network('Searching for target', undefined, {
        requester: senderUpeerId,
        target: data.targetId,
        referralContext: data.referralContext
    }, 'dht');
    const target = await getContactByUpeerId(data.targetId) as ContactRecord | undefined;
    const responseData: DhtResponsePayload = { type: 'DHT_RESPONSE', targetId: data.targetId };

    if (target && target.dhtSignature) {
        if (!target.address || typeof target.dhtSeq !== 'number') {
            sendResponse(fromAddress, responseData);
            return;
        }

        responseData.locationBlock = {
            address: target.address,
            dhtSeq: target.dhtSeq,
            signature: target.dhtSignature,
            expiresAt: target.dhtExpiresAt,
            renewalToken: target.renewalToken
                ? (() => { try { return JSON.parse(target.renewalToken); } catch { return undefined; } })()
                : undefined
        };
        responseData.publicKey = target.publicKey;
    } else {
        const kademlia = getKademliaInstance();
        if (kademlia) {
            const locationBlock = await kademlia.findLocationBlock(data.targetId);
            if (locationBlock) {
                responseData.locationBlock = locationBlock;
            }
            if (!responseData.locationBlock) {
                if (typeof kademlia.findClosestContacts === 'function') {
                    const closest = kademlia.findClosestContacts(data.targetId, 5);
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

export async function handleDhtResponse(data: DhtResponseInput, sendResponse?: LegacySendResponse): Promise<void> {
    if (typeof data.targetId !== 'string') {
        return;
    }

    if (!data.locationBlock && !Array.isArray(data.neighbors)) {
        return;
    }

    if (data.locationBlock) {
        const block = data.locationBlock;
        const existing = await getContactByUpeerId(data.targetId) as ContactRecord | undefined;
        if (!existing) return;

        const verificationKey = existing.publicKey || data.publicKey;
        if (!verificationKey) {
            return;
        }

        const isValid = await verifyLocationBlockWithDHT(data.targetId, block, verificationKey);
        if (!isValid || block.dhtSeq <= (existing.dhtSeq || 0)) {
            return;
        }

        network('Found new IP', undefined, { target: data.targetId, address: block.address }, 'dht');
        let finalBlock = block;
        let finalRenewalToken = block.renewalToken;

        if (existing.publicKey && canRenewLocationBlock(block, existing.publicKey)) {
            const renewed = renewLocationBlock(block, existing.publicKey);
            if (renewed) {
                finalBlock = renewed;
                finalRenewalToken = renewed.renewalToken;
                network('Renewed location block via legacy DHT', undefined, { targetId: data.targetId, renewalsUsed: renewed.renewalToken?.renewalsUsed }, 'dht-renewal');
            }
        }

        updateContactDhtLocation(data.targetId, finalBlock.addresses || finalBlock.address, finalBlock.dhtSeq, finalBlock.signature, finalBlock.expiresAt, finalRenewalToken);
        if (finalRenewalToken) {
            storeRenewalTokenInDHT(finalRenewalToken).catch(err => {
                error('Failed to store renewal token in DHT', err, 'dht-renewal');
            });
        }
    }

    if (Array.isArray(data.neighbors) && sendResponse) {
        for (const neighbor of data.neighbors) {
            if (!neighbor?.upeerId || !neighbor.locationBlock?.address) continue;
            if (neighbor.upeerId === data.targetId) continue;

            const existing = await getContactByUpeerId(neighbor.upeerId) as ContactRecord | undefined;
            const neighborSeq = neighbor.locationBlock.dhtSeq;

            if (!existing || (typeof neighborSeq === 'number' && neighborSeq > (existing.dhtSeq || 0))) {
                sendResponse(neighbor.locationBlock.address, { type: 'DHT_QUERY', targetId: data.targetId });
            }

            if (existing && typeof neighborSeq === 'number' && neighborSeq > (existing.dhtSeq || 0) && neighbor.locationBlock.signature) {
                updateContactDhtLocation(
                    neighbor.upeerId,
                    neighbor.locationBlock.addresses || neighbor.locationBlock.address,
                    neighborSeq,
                    neighbor.locationBlock.signature,
                    neighbor.locationBlock.expiresAt,
                    neighbor.locationBlock.renewalToken
                );
            }
        }
    }
}
