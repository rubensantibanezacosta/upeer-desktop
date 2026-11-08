import { getContactByUpeerId, isContactBlocked } from '../../storage/contacts/operations.js';
import { info, warn } from '../../security/secure-logger.js';
import { getDeviceIdentity } from '../../security/deviceIdentity.js';
import { getMyUPeerId } from '../../security/identity.js';
import { getVouchScore } from '../../security/reputation/vouches.js';
import { sendSecurePacket } from '../server/transport.js';
import { callManager } from './callManager.js';
import { callRingTargets } from './multiDeviceRing.js';
import type { CallMediaKind } from './callTypes.js';

/**
 * Identificador del dispositivo que contesta.
 *
 * Sin esto, dos dispositivos de la misma cuenta comparten `upeerId` y el llamante no sabe a cuál de
 * ellos hay que mandar la media ni a cuál contestar el `CALL_END`. Es opcional en el paquete para no
 * romper con un cliente anterior, que seguirá funcionando por cuenta como antes.
 */
export function myDeviceIdForCall(): string | undefined {
    try {
        return getDeviceIdentity()?.deviceId;
    } catch {
        return undefined;
    }
}

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
    sendSecurePacket(peer.address, packet, peer.publicKey);
    return true;
}

/**
 * Manda un paquete a **todas** las direcciones conocidas del contacto, no solo a la principal.
 *
 * `send()` resuelve una única dirección —`contact.address`, la última que se guardó— y con la cuenta
 * abierta en móvil y portátil eso dejaba la llamada sonando en uno solo, elegido por el orden en que
 * se habían visto las direcciones. Aquí se manda a todas y la sesión queda a la espera de que conteste
 * la primera.
 *
 * Devuelve cuántas salieron: cero significa que no se alcanzó a nadie.
 */
function sendToAllDevices(peerUpeerId: string, packet: Record<string, unknown>): number {
    const contact = getContactByUpeerId(peerUpeerId);
    if (!contact) return 0;
    const targets = callRingTargets(contact.address, contact.knownAddresses);
    let sent = 0;
    for (const address of targets) {
        try {
            sendSecurePacket(address, packet, contact.publicKey);
            sent += 1;
        } catch (cause) {
            // Una dirección caída no puede impedir que suene en las demás.
            warn('No se pudo ofrecer la llamada a un dispositivo del contacto', { upeerId: peerUpeerId, cause: String(cause) }, 'call');
        }
    }
    return sent;
}

function ringTargetsOf(peerUpeerId: string): string[] {
    const contact = getContactByUpeerId(peerUpeerId);
    return contact ? callRingTargets(contact.address, contact.knownAddresses) : [];
}

/**
 * Calla los demás dispositivos cuando uno contesta.
 *
 * Manda un `CALL_END` con `reason: 'answered-elsewhere'` a todas las direcciones ofrecidas menos a la
 * que contestó. Sin esto, el portátil se quedaba sonando hasta el tope de 30 s aunque la llamada ya
 * estuviera en marcha en el móvil: la sesión del llamante se cerraba, pero el otro extremo no se
 * enteraba.
 *
 * Se manda por dirección y no por `upeerId` porque es justo lo que hay que distinguir aquí: los
 * dispositivos de una misma cuenta comparten usuario.
 */
export function cancelOtherDevices(callId: string): number {
    const session = callManager.get(callId);
    if (!session || session.isGroup) return 0;
    const targets = session.ringTargets ?? [];
    if (targets.length === 0) return 0;
    const contact = getContactByUpeerId(session.peerUpeerId);
    if (!contact) return 0;
    const answered = session.answeredAddress;
    let sent = 0;
    for (const address of targets) {
        if (answered && address === answered) continue;
        try {
            sendSecurePacket(address, {
                type: 'CALL_END',
                callId,
                reason: 'answered-elsewhere',
                timestamp: Date.now(),
            }, contact.publicKey);
            sent += 1;
        } catch (cause) {
            warn('No se pudo callar un dispositivo del contacto', { callId, cause: String(cause) }, 'call');
        }
    }
    if (sent > 0) info('Callados los demás dispositivos de la llamada', { callId, dispositivos: sent }, 'call');
    return sent;
}

export async function sendCallOffer(peerUpeerId: string, kind: CallMediaKind): Promise<string> {
    if (isContactBlocked(peerUpeerId)) throw new Error('Contact unavailable');
    if (!resolvePeer(peerUpeerId)) throw new Error('Contact unavailable');
    const session = callManager.create(peerUpeerId, kind, 'outgoing');
    // La oferta va a todos los dispositivos del contacto: gana el que conteste antes y a los demás se
    // les calla con `answered-elsewhere`. Antes iba a uno solo, elegido al azar.
    const startedAt = Date.now();
    // Se guardan las direcciones ofrecidas para poder callar a las demás cuando una conteste.
    session.ringTargets = ringTargetsOf(peerUpeerId);
    const sent = sendToAllDevices(peerUpeerId, {
        type: 'CALL_OFFER',
        callId: session.callId,
        kind,
        timestamp: startedAt,
    });
    if (sent === 0) {
        // Nadie recibió la oferta: el otro está offline. La sesión se cierra con `error` para que la
        // UI deje de decir que suena, y se deja un aviso en el vault para que lo vea al volver. Antes
        // esta rama solo lanzaba, así que no quedaba rastro en ningún sitio.
        callManager.end(session.callId, 'error');
        void queueMissedCallNotice(peerUpeerId, session.callId, kind, startedAt);
        throw new Error('Contact unavailable');
    }
    return session.callId;
}

/**
 * Deja el aviso de llamada perdida en el vault, para entrega cuando el otro vuelva a estar en línea.
 *
 * Sin esto, marcar a alguien offline no dejaba rastro: ni historial ni buzón. Va sin `await` en la
 * ruta de la llamada porque replicar en el vault tarda y no puede retrasar el marcar; un fallo se
 * anota y se sigue, que la llamada ya está cerrada de todas formas.
 */
async function queueMissedCallNotice(peerUpeerId: string, callId: string, kind: CallMediaKind, timestamp: number): Promise<void> {
    try {
        const { VaultManager } = await import('../vault/manager.js');
        const { missedCallNotice, missedCallPayloadId, MISSED_CALL_VAULT_TTL_MS } = await import('./missedCallVault.js');
        const contact = getContactByUpeerId(peerUpeerId);
        if (!contact) return;
        await VaultManager.replicateToVaults(
            contact.upeerId,
            missedCallNotice(callId, kind, timestamp) as unknown as Record<string, unknown>,
            MISSED_CALL_VAULT_TTL_MS,
            missedCallPayloadId(callId),
        );
        info('Llamada perdida guardada en el vault para entrega al reconectar', { callId }, 'call');
    } catch (cause) {
        warn('No se pudo guardar el aviso de llamada perdida', { callId, cause: String(cause) }, 'call');
    }
}

export async function startGroupCall(memberUpeerIds: string[], kind: CallMediaKind, groupId?: string): Promise<string> {
    const session = callManager.createGroup(memberUpeerIds, kind, groupId);
    for (const member of memberUpeerIds) {
        send(member, {
            type: 'CALL_OFFER',
            callId: session.callId,
            kind,
            groupMembers: memberUpeerIds,
            groupId,
            timestamp: Date.now(),
        });
    }
    return session.callId;
}

export function sendCallRing(peerUpeerId: string, callId: string): void {
    send(peerUpeerId, { type: 'CALL_RING', callId, timestamp: Date.now() });
}

export function sendCallAccept(peerUpeerId: string, callId: string): void {
    // Con el dispositivo que contesta, el llamante sabe a dónde mandar la media y a quién callar.
    send(peerUpeerId, { type: 'CALL_ACCEPT', callId, deviceId: myDeviceIdForCall(), timestamp: Date.now() });
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

export function sendCallMediaTo(memberUpeerId: string, callId: string, data: Uint8Array, senderUpeerId?: string): void {
    send(memberUpeerId, { type: 'CALL_MEDIA', callId, data, senderUpeerId, timestamp: Date.now() });
}

export function sendCallMedia(peerUpeerId: string, callId: string, data: Uint8Array): void {
    const session = callManager.get(callId);
    if (session && session.isGroup) {
        const myId = getMyUPeerId();
        const relay = session.relayUpeerId;
        if (relay) {
            if (relay === myId) {
                // Soy el relay: fan-out a todos los demás miembros.
                for (const member of session.groupMembers) {
                    if (member !== myId) {
                        send(member, { type: 'CALL_MEDIA', callId, data, senderUpeerId: myId, timestamp: Date.now() });
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
