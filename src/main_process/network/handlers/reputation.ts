import { getGossipIds, getVouchesForDelivery, saveIncomingVouch } from '../../security/reputation/vouches.js';
import { getMainWindow } from '../../core/windowManager.js';

type ReputationSendResponse = (ip: string, data: Record<string, unknown>) => void;

type ReputationGossipPayload = {
    ids?: unknown;
};

type ReputationRequestPayload = {
    missing?: unknown;
};

type ReputationDeliverVouch = {
    id?: string;
    fromId?: string;
    toId?: string;
    type?: string;
    positive?: boolean;
    timestamp?: number;
    signature?: string;
};

type ReputationDeliverPayload = {
    vouches?: unknown;
};

export function handleReputationGossip(
    _upeerId: string,
    data: ReputationGossipPayload,
    sendResponse: ReputationSendResponse,
    rinfo: { address: string; port: number }
) {
    // BUG REP-GOSP fix: responder con los IDs que NOSOTROS tenemos y el peer NO tiene.
    // En un G-Set CRDT, el gossip debe ser bidireccional o permitir que ambos nodos
    // detecten lo que falta.
    const theirIds = new Set<string>(Array.isArray(data.ids) ? data.ids.filter((id): id is string => typeof id === 'string') : []);
    const ourIds = getGossipIds();

    // 1. Identificar qué nos falta a nosotros del peer (ya existente)
    const ourMissing = Array.from(theirIds).filter(id => !ourIds.includes(id)).slice(0, 50);
    if (ourMissing.length > 0) {
        sendResponse(rinfo.address, { type: 'REPUTATION_REQUEST', missing: ourMissing });
    }

    // No rebotes REPUTATION_GOSSIP aquí.
    // El flujo anti-entropía queda en GOSSIP -> REQUEST -> DELIVER.
    // Responder con otro GOSSIP genera ping-pong fácil en redes de 2 peers.
}

export function handleReputationRequest(
    _upeerId: string,
    data: ReputationRequestPayload,
    sendResponse: ReputationSendResponse,
    rinfo: { address: string; port: number }
) {
    // El peer nos pide vouches que le faltan
    const requested = Array.isArray(data.missing) ? data.missing.filter((id): id is string => typeof id === 'string') : [];
    const vouches = getVouchesForDelivery(requested);
    if (vouches.length > 0) {
        sendResponse(rinfo.address, { type: 'REPUTATION_DELIVER', vouches });
    }
}

export function handleReputationDeliver(
    _upeerId: string,
    data: ReputationDeliverPayload
) {
    const received = Array.isArray(data.vouches) ? data.vouches as ReputationDeliverVouch[] : [];
    if (received.length === 0) return;
    Promise.all(received.map(v => saveIncomingVouch(v))).then((results) => {
        const saved = results.filter(Boolean).length;
        if (saved > 0) {
            getMainWindow()?.webContents.send('reputation-updated');
        }
    }).catch(() => {
        getMainWindow()?.webContents.send('reputation-updated');
    });
}