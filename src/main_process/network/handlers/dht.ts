import {
    getContactByUpeerId,
    getContacts,
} from '../../storage/contacts/operations.js';
import { updateContactDhtLocation } from '../../storage/contacts/location.js';
import { upsertDevice } from '../../storage/devices-operations.js';
import { getMyUPeerId } from '../../security/identity.js';
import { verifyLocationBlock } from '../utils.js';
import { network, security } from '../../security/secure-logger.js';
import type { DeviceMetadata, LocationBlock, RenewalToken } from '../types.js';

type ContactRecord = {
    upeerId: string;
    status: 'pending' | 'incoming' | 'connected' | 'offline' | 'blocked';
    publicKey?: string;
    address?: string;
    dhtSeq?: number | null;
    dhtSignature?: string | null;
    dhtExpiresAt?: number | null;
    renewalToken?: string | null;
};

type DhtUpdateData = {
    locationBlock?: LocationBlock & { deviceMeta?: DeviceMetadata };
};

type DhtExchangePeer = {
    upeerId: string;
    publicKey: string;
    locationBlock: LocationBlock & { deviceMeta?: DeviceMetadata };
};

type DhtExchangeData = {
    peers?: DhtExchangePeer[];
};

type DhtQueryData = {
    targetId: string;
};

type DhtResponseNeighbor = {
    upeerId: string;
    publicKey?: string;
    locationBlock?: LocationBlock;
};

type DhtResponseData = {
    type: 'DHT_RESPONSE';
    targetId: string;
    locationBlock?: LocationBlock;
    publicKey?: string;
    neighbors?: DhtResponseNeighbor[];
};

function parseRenewalToken(value?: string | null): RenewalToken | undefined {
    if (!value) return undefined;
    try {
        return JSON.parse(value) as RenewalToken;
    } catch {
        return undefined;
    }
}

export async function handleDhtUpdate(upeerId: string, contact: ContactRecord, data: DhtUpdateData) {
    const block = data.locationBlock;
    if (!block || typeof block.dhtSeq !== 'number' || !block.address || !block.signature) return;

    const isValid = verifyLocationBlock(upeerId, block, contact.publicKey);
    if (!isValid) {
        security('Invalid DHT_UPDATE signature', { upeerId }, 'dht');
        return;
    }

    if (block.dhtSeq > (contact.dhtSeq || 0)) {
        network('Updating location', undefined, { upeerId, address: block.address, dhtSeq: block.dhtSeq }, 'dht');
        // Multi-device persistence: save device info from block if available
        if (block.deviceId && block.deviceMeta) {
            upsertDevice(upeerId, block.deviceId, block.deviceMeta).catch(() => {
                security('Failed to upsert device from DHT', { upeerId, deviceId: block.deviceId }, 'dht');
            });
        }
        // BUG CG fix: pasar block.renewalToken para que no se pierda el token de renovación
        // automática. Sin esto, si el bloque expiraba después de recibirse vía DHT_UPDATE,
        // updateContactDhtLocation no lo guardaba y la renovación fallaba silenciosamente.
        updateContactDhtLocation(upeerId, block.address, block.dhtSeq, block.signature, block.expiresAt, block.renewalToken);
    }
}

export async function handleDhtExchange(upeerId: string, data: DhtExchangeData) {
    if (!Array.isArray(data.peers)) return;
    network('Receiving peer locations', undefined, { upeerId, count: data.peers.length }, 'dht');

    for (const peer of data.peers) {
        if (!peer.upeerId || !peer.publicKey || !peer.locationBlock) continue;
        if (peer.upeerId === getMyUPeerId()) continue;

        const existing = await getContactByUpeerId(peer.upeerId);
        if (!existing) continue;

        const block = peer.locationBlock;
        if (typeof block.dhtSeq !== 'number' || !block.address || !block.signature) continue;

        const isValid = verifyLocationBlock(peer.upeerId, block, existing.publicKey);
        if (!isValid) {
            security('Invalid PEEREX signature', { peerId: peer.upeerId }, 'dht');
            continue;
        }

        if (block.dhtSeq > (existing.dhtSeq || 0)) {
            // Multi-device persistence: save device info from block if available
            if (block.deviceId && block.deviceMeta) {
                upsertDevice(peer.upeerId, block.deviceId, block.deviceMeta).catch(() => {
                    security('Failed to upsert device from PEEREX', { upeerId: peer.upeerId, deviceId: block.deviceId }, 'dht');
                });
            }
            // BUG CG fix: pasar block.renewalToken para preservar el token de renovación.
            updateContactDhtLocation(peer.upeerId, block.address, block.dhtSeq, block.signature, block.expiresAt, block.renewalToken);
        }
    }
}

export async function handleDhtQuery(upeerId: string, data: DhtQueryData, fromAddress: string, sendResponse: (ip: string, data: DhtResponseData) => void) {
    network('DHT query', undefined, { requester: upeerId, target: data.targetId }, 'dht');
    const target = await getContactByUpeerId(data.targetId) as ContactRecord | null;

    const responseData: DhtResponseData = { type: 'DHT_RESPONSE', targetId: data.targetId };

    if (target && target.status === 'connected' && target.dhtSignature) {
        // BUG BX fix: incluir dhtExpiresAt en el locationBlock de respuesta.
        // verifyLocationBlock prueba primero con expiresAt; si el bloque fue firmado con
        // él (todos los modernos lo son) y la respuesta no lo incluye, la verificación falla.
        // BUG CG fix: incluir renewalToken para que el receptor pueda auto-renovar al expirar.
        responseData.locationBlock = {
            address: target.address,
            dhtSeq: target.dhtSeq || 0,
            signature: target.dhtSignature,
            expiresAt: target.dhtExpiresAt ?? undefined,
            renewalToken: parseRenewalToken(target.renewalToken),
        };
        responseData.publicKey = target.publicKey;
    } else {
        const allContacts = getContacts() as ContactRecord[];
        const distanceXOR = (idA: string, idB: string) => {
            try { return BigInt('0x' + idA) ^ BigInt('0x' + idB); }
            catch { return BigInt(0); }
        };

        const closest = allContacts
            .filter(c => c.status === 'connected' && c.upeerId !== upeerId)
            .map(c => ({
                upeerId: c.upeerId,
                publicKey: c.publicKey,
                // BUG BX fix: incluir expiresAt para que verifyLocationBlock en el receptor
                // pueda verificar correctamente bloques firmados con expiresAt.
                // BUG CG fix: incluir renewalToken para auto-renovación al expirar.
                locationBlock: {
                    address: c.address,
                    dhtSeq: c.dhtSeq || 0,
                    signature: c.dhtSignature,
                    expiresAt: c.dhtExpiresAt ?? undefined,
                    renewalToken: parseRenewalToken(c.renewalToken),
                },
                dist: distanceXOR(c.upeerId, data.targetId)
            }))
            .sort((a, b) => (a.dist < b.dist ? -1 : a.dist > b.dist ? 1 : 0))
            .slice(0, 5)
            .map(({ dist: _dist, ...d }) => d);

        responseData.neighbors = closest;
    }
    sendResponse(fromAddress, responseData);
}

export async function handleDhtResponse(upeerId: string, data: DhtResponseData, sendResponse: (ip: string, data: DhtQueryData) => void) {
    if (data.locationBlock) {
        const block = data.locationBlock;
        const existing = await getContactByUpeerId(data.targetId) as ContactRecord | null;
        if (!existing) return;

        const isValid = verifyLocationBlock(data.targetId, block, existing.publicKey || data.publicKey);
        if (isValid && block.dhtSeq > (existing.dhtSeq || 0)) {
            network('DHT search found', undefined, { target: data.targetId, address: block.address }, 'dht');
            // BUG CG fix: pasar block.renewalToken
            updateContactDhtLocation(data.targetId, block.address, block.dhtSeq, block.signature, block.expiresAt, block.renewalToken);
        }
    } else if (data.neighbors) {
        network('DHT search referrals', undefined, { requester: upeerId, target: data.targetId, count: data.neighbors.length }, 'dht');
        for (const peer of data.neighbors) {
            if (peer.upeerId === getMyUPeerId()) continue;
            const existing = await getContactByUpeerId(peer.upeerId) as ContactRecord | null;
            if (!existing) {
                if (peer.locationBlock?.address) {
                    sendResponse(peer.locationBlock.address, { type: 'DHT_QUERY', targetId: data.targetId });
                }
            } else if (peer.locationBlock?.dhtSeq > (existing.dhtSeq || 0)) {
                updateContactDhtLocation(peer.upeerId, peer.locationBlock.address, peer.locationBlock.dhtSeq, peer.locationBlock.signature, peer.locationBlock.expiresAt);
                sendResponse(peer.locationBlock.address, { type: 'DHT_QUERY', targetId: data.targetId });
            }
        }
    }
}