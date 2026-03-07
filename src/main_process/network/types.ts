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
    | 'CHAT_UPDATE'   // Preview for phase 11
    // File transfer messages
    | 'FILE_START'
    | 'FILE_CHUNK'
    | 'FILE_END'
    | 'FILE_ACK'
    | 'FILE_CANCEL'
    // Kademlia DHT messages
    | 'DHT_PING'
    | 'DHT_PONG'
    | 'DHT_FIND_NODE'
    | 'DHT_FOUND_NODES'
    | 'DHT_FIND_VALUE'
    | 'DHT_FOUND_VALUE'
    | 'DHT_STORE'
    | 'DHT_STORE_ACK';

export interface LocationBlock {
    address: string;
    dhtSeq: number;
    signature: string;
    expiresAt?: number; // New field for extreme resilience
    renewalToken?: RenewalToken; // Optional renewal token
}

export interface RenewalToken {
    targetId: string;
    allowedUntil: number;
    maxRenewals: number;
    renewalsUsed: number;
    signature: string;
}

export interface ContactCacheEntry {
    revelnestId: string;
    locationBlock: LocationBlock;
    lastSeen: number;
}

export interface ContactCache {
    timestamp: number;
    contacts: ContactCacheEntry[];
}

// Kademlia DHT interfaces
export interface KademliaContactInfo {
    revelnestId: string;
    address: string;
    publicKey: string;
    nodeId: string; // Hex representation of 160-bit Kademlia ID
}

export interface DhtFindNode {
    targetId: string; // Hex Kademlia ID
}

export interface DhtFoundNodes {
    nodes: KademliaContactInfo[];
}

export interface DhtFindValue {
    key: string; // Hex key
}

export interface DhtFoundValue {
    key: string;
    value: any;
    publisher: string;
    timestamp: number;
    signature?: string;
}

export interface DhtStore {
    key: string;
    value: any;
    publisher: string;
    timestamp: number;
    signature?: string;
}

export interface DhtStoreAck {
    key: string;
}

// File transfer interfaces
export interface FileStartData {
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    totalChunks: number;
    fileHash: string; // SHA-256 hex
    chunkSize: number;
    thumbnail?: string; // base64 encoded thumbnail for images
    encryptionKey?: string; // Optional symmetric encryption key (encrypted with recipient's public key)
}

export interface FileChunkData {
    fileId: string;
    chunkIndex: number;
    totalChunks: number;
    data: string; // base64 encoded chunk data
    chunkHash: string; // SHA-256 hex of this chunk
    isCompressed?: boolean; // Whether the chunk data is compressed
}

export interface FileEndData {
    fileId: string;
    fileHash: string; // Final verification
    receivedChunks?: number[]; // Optional list of received chunks for verification
}

export interface FileAckData {
    fileId: string;
    chunkIndex?: number; // If acknowledging a specific chunk
    received: boolean;
    missingChunks?: number[]; // List of missing chunk indices
    nextExpected?: number; // Next chunk index expected (for flow control)
}

export interface FileCancelData {
    fileId: string;
    reason: string;
}

export interface NetworkPacket {
    type: MessageType;
    senderRevelnestId?: string;
    signature?: string;
    [key: string]: any;
}
