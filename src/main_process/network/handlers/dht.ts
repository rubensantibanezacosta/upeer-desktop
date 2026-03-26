import {
    getContactByUpeerId,
    getContacts,
} from '../../storage/contacts/operations.js';
import { updateContactDhtLocation } from '../../storage/contacts/location.js';
import { upsertDevice } from '../../storage/devices-operations.js';
import { getMyUPeerId } from '../../security/identity.js';
import { verifyLocationBlock } from '../utils.js';
import { network, security } from '../../security/secure-logger.js';

export async function handleDhtUpdate(upeerId: string, contact: any, data: any) {
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

export async function handleDhtExchange(upeerId: string, data: any) {
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

export async function handleDhtQuery(upeerId: string, data: any, fromAddress: string, sendResponse: (ip: string, data: any) => void) {
    network('DHT query', undefined, { requester: upeerId, target: data.targetId }, 'dht');
    const target = await getContactByUpeerId(data.targetId);

    const responseData: any = { type: 'DHT_RESPONSE', targetId: data.targetId };

    if (target && target.status === 'connected' && target.dhtSignature) {
        // BUG BX fix: incluir dhtExpiresAt en el locationBlock de respuesta.
        // verifyLocationBlock prueba primero con expiresAt; si el bloque fue firmado con
        // él (todos los modernos lo son) y la respuesta no lo incluye, la verificación falla.
        // BUG CG fix: incluir renewalToken para que el receptor pueda auto-renovar al expirar.
        responseData.locationBlock = {
            address: target.address,
            dhtSeq: target.dhtSeq,
            signature: target.dhtSignature,
            expiresAt: target.dhtExpiresAt ?? undefined,
            renewalToken: target.renewalToken
                ? (() => { try { return JSON.parse(target.renewalToken); } catch { return undefined; } })()
                : undefined
        };
        responseData.publicKey = target.publicKey;
    } else {
        const allContacts = getContacts() as any[];
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
                    dhtSeq: c.dhtSeq,
                    signature: c.dhtSignature,
                    expiresAt: c.dhtExpiresAt ?? undefined,
                    renewalToken: c.renewalToken
                        ? (() => { try { return JSON.parse(c.renewalToken); } catch { return undefined; } })()
                        : undefined
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

export async function handleDhtResponse(upeerId: string, data: any, sendResponse: (ip: string, data: any) => void) {
    if (data.locationBlock) {
        const block = data.locationBlock;
        const existing = await getContactByUpeerId(data.targetId);
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
            const existing = await getContactByUpeerId(peer.upeerId);
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