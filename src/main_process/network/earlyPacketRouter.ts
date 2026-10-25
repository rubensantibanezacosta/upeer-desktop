import type { BrowserWindow } from 'electron';
import { getMyUPeerId } from '../security/identity.js';
import { security } from '../security/secure-logger.js';
import type { NetworkPacket } from './types.js';
import { handleDhtPacket } from './dht/handlers.js';
import { handleHandshakeAccept, handleHandshakeReq } from './handlers/contacts.js';
import { handleInBandEnrollment, isEnrollmentPacket } from './enrollmentChannel.js';
import { certificateFromPacket, verifySelfSyncSignature } from './sync/auth.js';
import { routeSyncPacket } from './sync/handlers.js';

type PacketRecord = Record<string, unknown>;
type PacketAddress = { address: string; port: number };

export type EarlyPacketArgs = {
    pktType: string;
    data: PacketRecord;
    signature?: string;
    senderUpeerId?: string;
    senderYggAddress?: string;
    rinfo: PacketAddress;
    win: BrowserWindow | null;
    sendResponse: (ip: string, data: NetworkPacket) => void;
    tcpSourceAddress: string;
};

export async function routeEarlyPacket({
    pktType,
    data,
    signature,
    senderUpeerId,
    senderYggAddress,
    rinfo,
    win,
    sendResponse,
    tcpSourceAddress,
}: EarlyPacketArgs): Promise<boolean> {
    if (pktType === 'HANDSHAKE_REQ') {
        await handleHandshakeReq(
            data as NetworkPacket,
            signature ?? '',
            senderUpeerId ?? '',
            senderYggAddress ?? '',
            rinfo,
            win,
            sendResponse as (ip: string, data: Record<string, unknown>) => void,
            tcpSourceAddress,
        );
        return true;
    }

    if (pktType === 'HANDSHAKE_ACCEPT') {
        await handleHandshakeAccept(
            data as NetworkPacket,
            signature ?? '',
            senderUpeerId ?? '',
            senderYggAddress ?? '',
            rinfo,
            win,
            sendResponse as (ip: string, data: Record<string, unknown>) => void,
            tcpSourceAddress,
        );
        return true;
    }

    if (isEnrollmentPacket(pktType)) {
        if (pktType !== 'ENROLL_REQ') return true;
        handleInBandEnrollment(data, (address, payload) => {
            sendResponse(address, payload as unknown as NetworkPacket);
        });
        return true;
    }

    if (pktType.startsWith('DHT_') && senderUpeerId) {
        return handleDhtPacket(
            pktType,
            data as NetworkPacket,
            senderUpeerId,
            rinfo.address,
            win,
            sendResponse as never,
        );
    }

    if (pktType.startsWith('SYNC_') && senderUpeerId === getMyUPeerId()) {
        const certificate = certificateFromPacket(data, senderUpeerId);
        if (!certificate || !signature || !verifySelfSyncSignature(data, certificate, signature, senderUpeerId, senderYggAddress)) {
            security('Invalid self-device sync packet', { type: pktType, ip: rinfo.address }, 'sync');
            return true;
        }
        await routeSyncPacket(data, rinfo.address, win);
        return true;
    }

    return false;
}
