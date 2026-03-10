import { getGossipIds, getVouchesForDelivery, saveIncomingVouch } from '../../security/reputation/vouches.js';

export function handleReputationGossip(
    upeerId: string,
    data: any,
    sendResponse: (ip: string, data: any) => void,
    rinfo: { address: string; port: number }
) {
    // Recibimos la lista de IDs que tiene el peer
    // → respondemos con los que nos faltan (máx 100)
    const ourIds = new Set(getGossipIds());
    const theirIds: string[] = data.ids ?? [];
    const missing = theirIds.filter(id => !ourIds.has(id)).slice(0, 100);
    if (missing.length > 0) {
        sendResponse(rinfo.address, { type: 'REPUTATION_REQUEST', missing });
    }
}

export function handleReputationRequest(
    upeerId: string,
    data: any,
    sendResponse: (ip: string, data: any) => void,
    rinfo: { address: string; port: number }
) {
    // El peer nos pide vouches que le faltan
    const requested: string[] = data.missing ?? [];
    const vouches = getVouchesForDelivery(requested);
    if (vouches.length > 0) {
        sendResponse(rinfo.address, { type: 'REPUTATION_DELIVER', vouches });
    }
}

export function handleReputationDeliver(
    upeerId: string,
    data: any
) {
    // Recibimos vouches: verificar firma y persistir
    const received: any[] = data.vouches ?? [];
    for (const v of received) {
        saveIncomingVouch(v).catch(() => { });
    }
}