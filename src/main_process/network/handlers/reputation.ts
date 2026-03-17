import { getGossipIds, getVouchesForDelivery, saveIncomingVouch } from '../../security/reputation/vouches.js';

export function handleReputationGossip(
    upeerId: string,
    data: any,
    sendResponse: (ip: string, data: any) => void,
    rinfo: { address: string; port: number }
) {
    // BUG REP-GOSP fix: responder con los IDs que NOSOTROS tenemos y el peer NO tiene.
    // En un G-Set CRDT, el gossip debe ser bidireccional o permitir que ambos nodos
    // detecten lo que falta.
    const theirIds = new Set<string>(data.ids ?? []);
    const ourIds = getGossipIds();

    // 1. Identificar qué nos falta a nosotros del peer (ya existente)
    const ourMissing = Array.from(theirIds).filter(id => !ourIds.includes(id)).slice(0, 50);
    if (ourMissing.length > 0) {
        sendResponse(rinfo.address, { type: 'REPUTATION_REQUEST', missing: ourMissing });
    }

    // 2. Identificar qué le falta al peer de nuestra base de datos e informarle
    // Limitamos a 50 para no saturar el canal UDP. 
    // Al enviarle un REPUTATION_GOSSIP con nuestros IDs, el peer podrá 
    // iniciar su propio REPUTATION_REQUEST en el siguiente ciclo.
    const theirMissing = ourIds.filter(id => !theirIds.has(id)).slice(0, 50);
    if (theirMissing.length > 0) {
        // BUG REP-GOSP-PUSH: Empujar activamente nuestros IDs faltantes para
        // acelerar la convergencia del CRDT sin esperar a su heartbeat.
        sendResponse(rinfo.address, {
            type: 'REPUTATION_GOSSIP',
            ids: ourIds.slice(0, 100) // Enviamos nuestra lista para que él pida
        });
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