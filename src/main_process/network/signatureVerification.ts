import { verify } from '../security/identity.js';
import { debug, security } from '../security/secure-logger.js';
import { canonicalStringify } from './utils.js';

type PacketRecord = Record<string, unknown>;

export type SignatureVerificationArgs = {
    data: PacketRecord;
    fullPacket: PacketRecord;
    publicKey: string;
    senderDevicePublicKey?: string;
    signature?: string;
    senderUpeerId: string;
    senderYggAddress?: string;
    binaryMediaHash?: string;
    pktType: string;
    peerAddress: string;
};

export function verifyPacketSignature({
    data,
    fullPacket,
    publicKey,
    senderDevicePublicKey,
    signature,
    senderUpeerId,
    senderYggAddress,
    binaryMediaHash,
    pktType,
    peerAddress,
}: SignatureVerificationArgs): boolean {
    if (pktType === 'FILE_CHUNK') {
        debug('FILE_CHUNK pre-verify', { fileId: data.fileId, chunkIndex: data.chunkIndex }, 'file-transfer');
    }

    const dataForVerification: PacketRecord = { ...data };
    if (binaryMediaHash) {
        delete dataForVerification.data;
        dataForVerification.mediaHash = binaryMediaHash;
    }
    delete dataForVerification.contactCache;
    delete dataForVerification.renewalToken;

    const payloadForVerification: PacketRecord = { ...dataForVerification, senderUpeerId };
    if (senderYggAddress !== undefined) {
        payloadForVerification.senderYggAddress = senderYggAddress;
    }

    if (!signature || typeof signature !== 'string') {
        security('Packet missing signature', { ip: peerAddress, upeerId: senderUpeerId, type: pktType }, 'network');
        return false;
    }

    const payload = Buffer.from(canonicalStringify(payloadForVerification));
    const legacyPayload = !binaryMediaHash && senderYggAddress !== undefined
        ? Buffer.from(canonicalStringify({ ...dataForVerification, senderUpeerId }))
        : null;
    const signatureBuffer = Buffer.from(signature, 'hex');
    let verified = verify(payload, signatureBuffer, Buffer.from(publicKey, 'hex'));
    if (!verified && legacyPayload) {
        verified = verify(legacyPayload, signatureBuffer, Buffer.from(publicKey, 'hex'));
    }

    if (!verified && senderDevicePublicKey) {
        const deviceKey = Buffer.from(senderDevicePublicKey, 'hex');
        verified = verify(payload, signatureBuffer, deviceKey);
        if (!verified && legacyPayload) {
            verified = verify(legacyPayload, signatureBuffer, deviceKey);
        }
    }

    if (!verified) {
        if (pktType !== 'CALL_MEDIA') {
            security('Invalid signature', {
                upeerId: senderUpeerId,
                ip: peerAddress,
                type: pktType,
                payload: canonicalStringify(payloadForVerification),
                fullPacket,
            }, 'network');
        }
        return false;
    }

    if (pktType === 'FILE_CHUNK') {
        debug('FILE_CHUNK signature verified', { fileId: data.fileId, chunkIndex: data.chunkIndex }, 'file-transfer');
    }
    return true;
}
