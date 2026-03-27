import { verify } from '../../security/identity.js';
import { canonicalStringify } from '../utils.js';

type SignedTransferPacket = {
    signature?: string;
    senderUpeerId?: string;
    senderYggAddress?: string;
    isInternalSync?: boolean;
    [key: string]: unknown;
};

function buildCandidatePayloads(packet: SignedTransferPacket): Array<Record<string, unknown>> {
    const { signature: _signature, senderUpeerId, senderYggAddress, isInternalSync, ...basePayload } = packet;
    const candidates: Array<Record<string, unknown>> = [basePayload];

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

export function verifyFileTransferPacketSignature(packet: SignedTransferPacket, publicKey?: string): boolean {
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