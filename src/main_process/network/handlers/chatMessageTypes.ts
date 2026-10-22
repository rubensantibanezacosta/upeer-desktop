import type { RatchetHeader } from '../../security/ratchetShared.js';

export type ChatSignedPreKeyBundle = {
    spkPub: string;
    spkSig: string;
    spkId: number;
};

export type ChatX3dhInit = {
    ikPub: string;
    ekPub: string;
    spkId: number;
};

export type ChatIncomingPayload = {
    id?: string;
    content: string;
    nonce?: string;
    ephemeralPublicKey?: string;
    replyTo?: string;
    x3dhInit?: ChatX3dhInit;
    ratchetHeader?: RatchetHeader;
    isInternalSync?: boolean;
    timestamp?: number;
    useRecipientEphemeral?: boolean;
    senderDeviceId?: string;
};

export type ChatContactRecord = {
    upeerId: string;
    publicKey?: string;
    name?: string;
    alias?: string;
    deviceId?: string | null;
    devicePublicKey?: string | null;
    deviceSignedPreKey?: string | null;
    deviceSignedPreKeyId?: number | null;
};

export type ChatAckPacket = {
    type: 'ACK';
    id?: string;
    status: 'delivered';
};

export type ChatDrResetPacket = {
    type: 'DR_RESET';
    resetId: string;
    signedPreKey: ChatSignedPreKeyBundle;
    ratchetContext?: 'direct' | `group:${string}`;
    senderDeviceId?: string;
};