import { getContactByUpeerId } from '../../storage/contacts/operations.js';
import { getMyUPeerId } from '../../security/identity.js';
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
    send(peerUpeerId, { type: 'CALL_END', callId, timestamp: Date.now() });
}

export function sendCallMedia(peerUpeerId: string, callId: string, data: string): void {
    const session = callManager.get(callId);
    if (session && session.isGroup) {
        const myId = getMyUPeerId();
        for (const member of session.groupMembers) {
            if (member !== myId) {
                send(member, { type: 'CALL_MEDIA', callId, data, timestamp: Date.now() });
            }
        }
        return;
    }
    send(peerUpeerId, { type: 'CALL_MEDIA', callId, data, timestamp: Date.now() });
}

export function sendCallMediaUpdate(
    peerUpeerId: string,
    callId: string,
    updates: { muted?: boolean; cameraEnabled?: boolean },
): void {
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
