import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { getMyUPeerId } from '../../security/identity.js';
import { getVouchScore } from '../../security/reputation/vouches.js';
import { sendSecureUDPMessage } from '../server/transport.js';
import { callManager } from './callManager.js';
import type { CallMediaKind } from './callTypes.js';

type ResolvedPeer = {
    address: string;
    publicKey?: string;
};

function resolvePeer(peerUpeerId: string): ResolvedPeer | null {
    const contact = getContactByUpeerId(peerUpeerId);
    if (!contact || typeof contact.address !== 'string' || contact.address.length === 0) {
        return null;
    }
    return { address: contact.address, publicKey: contact.publicKey };
}

function send(peerUpeerId: string, packet: Record<string, unknown>): boolean {
    const peer = resolvePeer(peerUpeerId);
    if (!peer) {
        return false;
    }
    sendSecureUDPMessage(peer.address, packet, peer.publicKey);
    return true;
}

export async function sendCallOffer(peerUpeerId: string, kind: CallMediaKind): Promise<string> {
    const session = callManager.create(peerUpeerId, kind, 'outgoing');
    send(peerUpeerId, {
        type: 'CALL_OFFER',
        callId: session.callId,
        kind,
        timestamp: Date.now(),
    });
    return session.callId;
}

export async function startGroupCall(memberUpeerIds: string[], kind: CallMediaKind): Promise<string> {
    const session = callManager.createGroup(memberUpeerIds, kind);
    for (const member of memberUpeerIds) {
        send(member, {
            type: 'CALL_OFFER',
            callId: session.callId,
            kind,
            groupMembers: memberUpeerIds,
            timestamp: Date.now(),
        });
    }
    return session.callId;
}

export function sendCallRing(peerUpeerId: string, callId: string): void {
    send(peerUpeerId, { type: 'CALL_RING', callId, timestamp: Date.now() });
}

export function sendCallAccept(peerUpeerId: string, callId: string): void {
    send(peerUpeerId, { type: 'CALL_ACCEPT', callId, timestamp: Date.now() });
}

export function sendCallReject(peerUpeerId: string, callId: string): void {
    send(peerUpeerId, { type: 'CALL_REJECT', callId, timestamp: Date.now() });
}

export function sendCallBusy(peerUpeerId: string, callId: string): void {
    send(peerUpeerId, { type: 'CALL_BUSY', callId, timestamp: Date.now() });
}

export function sendCallCancel(peerUpeerId: string, callId: string): void {
    send(peerUpeerId, { type: 'CALL_CANCEL', callId, timestamp: Date.now() });
}

export function sendCallEnd(peerUpeerId: string, callId: string): void {
    const session = callManager.get(callId);
    if (session && session.isGroup) {
        const myId = getMyUPeerId();
        for (const member of session.groupMembers) {
            if (member !== myId) {
                send(member, { type: 'CALL_END', callId, timestamp: Date.now() });
            }
        }
        return;
    }
    send(peerUpeerId, { type: 'CALL_END', callId, timestamp: Date.now() });
}

export function sendCallMediaTo(memberUpeerId: string, callId: string, data: string): void {
    send(memberUpeerId, { type: 'CALL_MEDIA', callId, data, timestamp: Date.now() });
}

export function sendCallMedia(peerUpeerId: string, callId: string, data: string): void {
    const session = callManager.get(callId);
    if (session && session.isGroup) {
        const myId = getMyUPeerId();
        const relay = session.relayUpeerId;
        if (relay) {
            if (relay === myId) {
                // Soy el relay: fan-out a todos los demás miembros.
                for (const member of session.groupMembers) {
                    if (member !== myId) {
                        send(member, { type: 'CALL_MEDIA', callId, data, timestamp: Date.now() });
                    }
                }
            } else if (relay !== myId) {
                // No soy el relay: envío mi media solo al relay.
                send(relay, { type: 'CALL_MEDIA', callId, data, timestamp: Date.now() });
            }
            return;
        }
        // Sin relay electo: fallback a fan-out completo.
        for (const member of session.groupMembers) {
            if (member !== myId) {
                send(member, { type: 'CALL_MEDIA', callId, data, timestamp: Date.now() });
            }
        }
        return;
    }
    send(peerUpeerId, { type: 'CALL_MEDIA', callId, data, timestamp: Date.now() });
}

export function sendCallSdp(
    peerUpeerId: string,
    callId: string,
    sdp: { type: string; sdp?: string; relay?: string },
): void {
    send(peerUpeerId, { type: 'CALL_SDP', callId, sdp, timestamp: Date.now() });
}

export function sendCallIce(
    peerUpeerId: string,
    callId: string,
    candidate: Record<string, unknown>,
): void {
    send(peerUpeerId, { type: 'CALL_ICE', callId, candidate, timestamp: Date.now() });
}

/**
 * Elige de forma determinista el relay de una llamada de grupo entre los
 * participantes, priorizando la mayor reputación (vouch score) y desempatando
 * por upeerId (menor lexicográficamente). Todos los nodos llegan al mismo
 * resultado para el mismo conjunto de participantes.
 */
export async function electRelay(memberUpeerIds: string[]): Promise<string> {
    const unique = Array.from(new Set(memberUpeerIds.filter((id) => typeof id === 'string' && id.length > 0)));
    if (unique.length === 0) {
        return '';
    }
    const withScores = await Promise.all(
        unique.map(async (id) => {
            let score = 50;
            try {
                score = await getVouchScore(id);
            } catch {
                score = 50;
            }
            return { id, score };
        }),
    );
    withScores.sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return withScores[0].id;
}

/**
 * Número mínimo de participantes (incluido uno mismo) a partir del cual se
 * activa el relay distribuido. Por debajo se usa mesh (fan-out directo), que
 * tiene menor latencia y no concentra tráfico en un nodo; por encima, el relay
 * reduce la subida de cada participante de O(N) a O(1).
 */
export const RELAY_THRESHOLD = 4;

/**
 * Recalcula el relay de la llamada de grupo a partir de los participantes
 * conectados y lo fija localmente (determinista). Devuelve el relay elegido o
 * undefined si el grupo usa mesh (por debajo del umbral).
 */
export async function recomputeRelay(callId: string): Promise<string | undefined> {
    const session = callManager.get(callId);
    if (!session || !session.isGroup) {
        return undefined;
    }
    const myId = getMyUPeerId();
    const candidates = [...session.groupMembers, session.peerUpeerId, myId];
    const uniqueCandidates = Array.from(new Set(candidates.filter((id) => typeof id === 'string' && id.length > 0)));
    if (uniqueCandidates.length <= RELAY_THRESHOLD) {
        // Mesh: sin relay.
        callManager.clearRelay(callId);
        return undefined;
    }
    const relay = await electRelay(uniqueCandidates);
    if (relay) {
        callManager.setRelayUpeer(callId, relay);
    }
    return relay;
}

export function sendCallMediaUpdate(
    peerUpeerId: string,
    callId: string,
    updates: { muted?: boolean; cameraEnabled?: boolean },
): void {
    const session = callManager.get(callId);
    if (session && session.isGroup) {
        const myId = getMyUPeerId();
        for (const member of session.groupMembers) {
            if (member !== myId) {
                send(member, { type: 'CALL_MEDIA_UPDATE', callId, ...updates, timestamp: Date.now() });
            }
        }
        return;
    }
    send(peerUpeerId, { type: 'CALL_MEDIA_UPDATE', callId, ...updates, timestamp: Date.now() });
}

export function sendCallMeta(peerUpeerId: string, callId: string, meta: Record<string, unknown>): void {
    send(peerUpeerId, { type: 'CALL_META', callId, meta, timestamp: Date.now() });
}

export function sendCallJoin(callId: string, memberUpeerId: string, kind: CallMediaKind, groupMembers: string[]): void {
    send(memberUpeerId, {
        type: 'CALL_JOIN',
        callId,
        kind,
        groupMembers,
        timestamp: Date.now(),
    });
}

export function sendCallLeave(callId: string, memberUpeerId: string): void {
    send(memberUpeerId, { type: 'CALL_LEAVE', callId, timestamp: Date.now() });
}
