// Re-export all public APIs
export { KademliaDHT } from './main.js';
export { toKademliaId } from './types.js';
export { xorDistance } from './distance.js';
export { createLocationBlockKey, createVaultPointerKey } from './store.js';
export type { KademliaContact, StoredValue, KademliaStats, SeedNode } from './types.js';

// Export constants for advanced usage
export {
    K,
    ALPHA,
    ID_LENGTH_BITS,
    ID_LENGTH_BYTES,
    BUCKET_COUNT,
    REFRESH_INTERVAL_MS,
    REPUBLISH_INTERVAL_MS,
    TTL_MS,
    BOOTSTRAP_MIN_NODES,
    BOOTSTRAP_RETRY_MS,
    SEED_NODES
} from './types.js';

// Export internal components for testing/advanced usage
export { KBucket } from './kbucket.js';
export { RoutingTable } from './routing.js';
export { ValueStore } from './store.js';
export { BootstrapManager } from './bootstrap.js';
export { ProtocolHandler } from './protocol.js';
export { compareDistance, getBucketIndex } from './distance.js';