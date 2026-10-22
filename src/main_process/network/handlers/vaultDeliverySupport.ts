export type VaultSendResponse = (ip: string, data: Record<string, unknown>) => void;

export type VaultEntry = {
    senderSid: string;
    payloadHash?: string;
    recipientDeviceId?: string | null;
    data: string;
};

export type VaultDeliveryPayload = {
    entries?: unknown;
    hasMore?: unknown;
    nextOffset?: unknown;
    nextAfterId?: unknown;
};

export type VaultOriginContact = {
    upeerId: string;
    publicKey: string;
    deviceId?: string | null;
    devicePublicKey?: string | null;
};

export type VaultInnerPacket = {
    type?: string;
    signature?: string;
    senderUpeerId?: string;
    isInternalSync?: boolean;
    fileHash?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    payloadHash?: string;
    [key: string]: unknown;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function isVaultEntry(value: unknown): value is VaultEntry {
    return isRecord(value) && typeof value.senderSid === 'string' && typeof value.data === 'string';
}

export function getVaultVerificationKeys(contact: VaultOriginContact, packet: VaultInnerPacket): string[] {
    const keys = [contact.publicKey];
    const senderDeviceId = typeof packet.senderDeviceId === 'string'
        ? packet.senderDeviceId.toLowerCase()
        : undefined;
    const devicePublicKey = contact.devicePublicKey?.toLowerCase();
    if (
        senderDeviceId
        && contact.deviceId?.toLowerCase() === senderDeviceId
        && devicePublicKey
        && /^[0-9a-f]{64}$/.test(devicePublicKey)
    ) {
        keys.push(devicePublicKey);
    }
    return Array.from(new Set(keys));
}

export function isVaultGroupPacket(type: unknown): boolean {
    return type === 'GROUP_MSG' || type === 'GROUP_ACK' || type === 'GROUP_INVITE'
        || type === 'GROUP_UPDATE' || type === 'GROUP_LEAVE';
}
