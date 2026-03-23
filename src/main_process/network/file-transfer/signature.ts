import { verify } from '../../security/identity.js';
import { canonicalStringify } from '../utils.js';

function buildCandidatePayloads(packet: any): any[] {
    const { signature: _signature, senderUpeerId, senderYggAddress, isInternalSync, ...basePayload } = packet;
    const candidates = [basePayload];

    if (senderUpeerId !== undefined) {
        candidates.push({ ...basePayload, senderUpeerId });
        candidates.push({
            ...basePayload,
            senderUpeerId,
            ...(senderYggAddress !== undefined ? { senderYggAddress } : {}),
        });
        candidates.push({
            ...basePayload,
            senderUpeerId,
            ...(senderYggAddress !== undefined ? { senderYggAddress } : {}),
            ...(isInternalSync !== undefined ? { isInternalSync } : {}),
        });
    }

    const seen = new Set<string>();
    return candidates.filter(candidate => {
        const key = canonicalStringify(candidate);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function verifyFileTransferPacketSignature(packet: any, publicKey?: string): boolean {
    if (!packet?.signature) return true;
    if (!publicKey) return false;

    const signatureBuffer = Buffer.from(packet.signature, 'hex');
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');

    return buildCandidatePayloads(packet).some(candidate => verify(
        Buffer.from(canonicalStringify(candidate)),
        signatureBuffer,
        publicKeyBuffer,
    ));
}