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

export type TransferSigner = {
    publicKey?: string | null;
    deviceId?: string | null;
    devicePublicKey?: string | null;
};

export function verifyFileTransferPacketFromSigner(packet: SignedTransferPacket, signer: TransferSigner | null | undefined): boolean {
    if (!packet?.signature) return true;
    if (verifyFileTransferPacketSignature(packet, signer?.publicKey ?? undefined)) return true;

    const announcedDeviceId = typeof packet.senderDeviceId === 'string'
        ? packet.senderDeviceId.toLowerCase()
        : undefined;
    const knownDeviceId = typeof signer?.deviceId === 'string' ? signer.deviceId.toLowerCase() : undefined;
    const devicePublicKey = typeof signer?.devicePublicKey === 'string' && /^[0-9a-f]{64}$/i.test(signer.devicePublicKey)
        ? signer.devicePublicKey
        : undefined;
    if (!announcedDeviceId || !knownDeviceId || announcedDeviceId !== knownDeviceId || !devicePublicKey) return false;

    return verifyFileTransferPacketSignature(packet, devicePublicKey);
}