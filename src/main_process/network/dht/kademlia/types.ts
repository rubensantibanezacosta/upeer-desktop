import crypto from 'node:crypto';

// Constants for Kademlia DHT
export const K = 20; // Bucket size (standard Kademlia parameter)
export const ALPHA = 3; // Concurrency parameter
export const ID_LENGTH_BITS = 160; // Standard Kademlia ID length
export const ID_LENGTH_BYTES = ID_LENGTH_BITS / 8; // 20 bytes
export const BUCKET_COUNT = ID_LENGTH_BITS; // 160 buckets for 160 bits
export const REFRESH_INTERVAL_MS = 3600000; // Refresh buckets every hour
export const REPUBLISH_INTERVAL_MS = 86400000; // Republish data every 24 hours
export const TTL_MS = 2592000000; // Time-to-live for stored values: 30 days (30 * 24 * 60 * 60 * 1000)
export const BOOTSTRAP_MIN_NODES = 10; // Minimum nodes to consider DHT "bootstrapped" (increased from 5)
export const BOOTSTRAP_RETRY_MS = 30000; // Retry bootstrap every 30 seconds if not enough nodes

export interface SeedNode {
    upeerId: string;
    address: string;
    publicKey: string;
}

export const SEED_NODES: SeedNode[] = [
    // Nodos semilla iniciales - en producción se cargarían desde:
    // 1. Configuración hardcoded en la app
    // 2. DNS TXT records (dht-seeds.upeer.chat)
    // 3. Archivo de configuración local
    // 
    // Formato ejemplo:
    // {
    //     upeerId: "802d20068fe07d3c3c16a15491210cd2",
    //     address: "200:xxxx:xxxx:xxxx::xxxx",
    //     publicKey: "a1b2c3d4e5f6..."
    // }
];

// Contact information for Kademlia
export interface KademliaContact {
    nodeId: Buffer;           // Kademlia ID (160-bit)
    upeerId: string;      // Original upeer ID
    address: string;          // Yggdrasil IPv6 address
    publicKey: string;        // Ed25519 public key
    lastSeen: number;         // Timestamp of last successful communication
    dhtSeq?: number;          // DHT sequence number (for location updates)
    dhtSignature?: string;    // Signature for location block
}

// Stored value in DHT
export interface StoredValue {
    key: Buffer;              // Key (hash of the value or upeerId)
    value: unknown;           // The stored data (LocationBlock, etc.)
    publisher: string;        // upeer ID of publisher
    timestamp: number;        // Publication time
    signature?: string;       // Optional signature for verification
}

// Statistics interface
export interface KademliaStats {
    storeOperations: number;
    findOperations: number;
    messagesSent: number;
    messagesReceived: number;
    bootstrapAttempts: number;
    bootstrapSuccesses: number;
    totalContacts: number;
    totalBuckets: number;
    storedValues: number;
}

// Convert upeer ID (128-bit hex) to Kademlia ID (160-bit Buffer)
export function toKademliaId(upeerId: string): Buffer {
    // upeer ID is 32 hex chars = 16 bytes = 128 bits
    // We extend to 160 bits using SHA-256 and taking first 20 bytes
    const hash = crypto.createHash('sha256');
    hash.update(upeerId, 'hex');
    return hash.digest().slice(0, ID_LENGTH_BYTES);
}