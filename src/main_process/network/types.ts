export type MessageType =
    | 'HANDSHAKE_REQ'
    | 'HANDSHAKE_ACCEPT'
    | 'DHT_UPDATE'
    | 'DHT_EXCHANGE'
    | 'DHT_QUERY'
    | 'DHT_RESPONSE'
    | 'PING'
    | 'PONG'
    | 'CHAT'
    | 'ACK'
    | 'READ'
    | 'TYPING'
    | 'CHAT_CONTACT'
    | 'CHAT_REACTION' // Preview for phase 11
    | 'CHAT_DELETE'   // Preview for phase 11
    | 'CHAT_UPDATE';   // Preview for phase 11

export interface LocationBlock {
    address: string;
    dhtSeq: number;
    signature: string;
}

export interface NetworkPacket {
    type: MessageType;
    senderRevelnestId?: string;
    signature?: string;
    [key: string]: any;
}
