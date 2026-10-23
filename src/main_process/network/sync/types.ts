import type { AccountDeviceCertificate } from '../../security/deviceCertificate.js';
import type { RatchetHeader, X3DHInitPacket } from '../../security/ratchetShared.js';
import type { SyncEventKind } from '../../storage/sync/eventSink.js';

export const SYNC_EVENT_KINDS: SyncEventKind[] = [
    'MESSAGE_UPSERT',
    'MESSAGE_STATUS',
    'MESSAGE_EDIT',
    'MESSAGE_DELETE',
    'CHAT_CLEAR',
    'REACTION_SET',
];

export type SyncDeviceBinding = {
    deviceId: string;
    devicePublicKey: string;
    deviceCertificate: AccountDeviceCertificate;
    deviceSignedPreKey: {
        spkPub: string;
        spkSig: string;
        spkId: number;
    };
};

export type SyncHelloPayload = {
    deviceId: string;
    deviceCertificate: AccountDeviceCertificate;
    deviceSignedPreKey: {
        spkPub: string;
        spkSig: string;
        spkId: number;
    };
    timestamp: number;
    ack: boolean;
};

export type SyncPlainEvent = {
    eventId: string;
    kind: SyncEventKind;
    occurredAt: number;
    sequence: number;
    originDeviceId?: string;
    payload: Record<string, unknown>;
};

export type SyncRatchetFields = {
    content: string;
    nonce: string;
    ratchetHeader?: RatchetHeader;
    x3dhInit?: X3DHInitPacket;
};

export type SyncEncryptedPacket = SyncRatchetFields & {
    senderDeviceId: string;
    senderDeviceCertificate: AccountDeviceCertificate;
    recipientDeviceId: string;
};

export type SyncEnvelopePacket = SyncEncryptedPacket & {
    type: 'SYNC_ENVELOPE';
    eventId: string;
    kind: SyncEventKind;
    occurredAt: number;
    sequence: number;
    epoch: number;
};

export type SyncHistoryRequestPacket = SyncEncryptedPacket & {
    type: 'SYNC_HISTORY_REQ';
    requestId: string;
    cursor: string | null;
    limit: number;
};

export type SyncHistoryEntry = SyncPlainEvent;

export type SyncHistoryResponsePacket = SyncEncryptedPacket & {
    type: 'SYNC_HISTORY_RES';
    requestId: string;
    entries: SyncHistoryEntry[];
    nextCursor: string | null;
    done: boolean;
};

export type SyncAckPacket = {
    type: 'SYNC_ACK';
    eventId: string;
    sequence: number;
    senderDeviceId: string;
    senderDeviceCertificate: AccountDeviceCertificate;
};
