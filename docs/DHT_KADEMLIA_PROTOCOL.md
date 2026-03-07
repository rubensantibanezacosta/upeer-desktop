# RevelNest Kademlia DHT Protocol

## Overview

The Kademlia Distributed Hash Table (DHT) is a decentralized peer-to-peer routing and storage system that enables efficient discovery and data retrieval in the RevelNest network. This document describes the implementation details, message formats, and protocols used by RevelNest's Kademlia DHT.

## Key Design Decisions

### 1. Node Identifiers
- **RevelNest ID**: 32-character hex string (128 bits) derived from Ed25519 public key
- **Kademlia ID**: 160-bit SHA-256 hash of RevelNest ID (first 20 bytes)
- **Distance Metric**: XOR distance between Kademlia IDs

### 2. Network Parameters
| Parameter | Value | Description |
|-----------|-------|-------------|
| `K` | 20 | Bucket size (standard Kademlia parameter) |
| `ALPHA` | 3 | Concurrency factor for parallel queries |
| `ID_LENGTH_BITS` | 160 | Kademlia ID length in bits |
| `BUCKET_COUNT` | 160 | Number of k-buckets (one per bit) |
| `BOOTSTRAP_MIN_NODES` | 10 | Minimum nodes required for DHT operation |
| `TTL_MS` | 30 days | Time-to-live for stored values |
| `REFRESH_INTERVAL_MS` | 1 hour | Bucket refresh interval |
| `REPUBLISH_INTERVAL_MS` | 24 hours | Value republishing interval |

### 3. Bootstrap Strategy
Three-tier bootstrap approach:
1. **Existing Social Contacts**: Load connected contacts from local SQLite database
2. **Seed Nodes**: Pre-configured stable nodes (administratively managed)
3. **Reactive Discovery**: Learn new nodes from incoming messages

## Data Structures

### Kademlia Contact
```typescript
interface KademliaContact {
    nodeId: Buffer;           // 160-bit Kademlia ID
    revelnestId: string;      // Original RevelNest ID (32-char hex)
    address: string;          // Yggdrasil IPv6 address
    publicKey: string;        // Ed25519 public key (hex)
    lastSeen: number;         // Timestamp of last communication
    dhtSeq?: number;          // DHT sequence number for location updates
    dhtSignature?: string;    // Signature for location block
}
```

### Stored Value
```typescript
interface StoredValue {
    key: Buffer;              // Key (hash of the value or revelnestId)
    value: any;               // The stored data (LocationBlock, etc.)
    publisher: string;        // RevelNest ID of publisher
    timestamp: number;        // Publication time (milliseconds)
    signature?: string;       // Optional cryptographic signature
}
```

## Protocol Messages

All DHT messages are wrapped in the standard RevelNest packet format with cryptographic signatures.

### Common Packet Structure
```json
{
    "type": "DHT_*",
    "senderRevelnestId": "802d20068fe07d3c3c16a15491210cd2",
    "signature": "ed25519_signature_hex",
    ... // message-specific fields
}
```

### 1. DHT_PING / DHT_PONG
**Purpose**: Node liveness checking and latency measurement.

**Request (DHT_PING)**:
```json
{
    "type": "DHT_PING",
    "timestamp": 1672531200000
}
```

**Response (DHT_PONG)**:
```json
{
    "type": "DHT_PONG",
    "nodeId": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4"
}
```

### 2. DHT_FIND_NODE / DHT_FOUND_NODES
**Purpose**: Find the K closest nodes to a given ID.

**Request (DHT_FIND_NODE)**:
```json
{
    "type": "DHT_FIND_NODE",
    "targetId": "hex_encoded_160_bit_kademlia_id"
}
```

**Response (DHT_FOUND_NODES)**:
```json
{
    "type": "DHT_FOUND_NODES",
    "nodes": [
        {
            "revelnestId": "802d20068fe07d3c3c16a15491210cd2",
            "address": "200:1234:5678::1",
            "publicKey": "ed25519_pubkey_hex",
            "nodeId": "kademlia_id_hex"
        }
    ]
}
```

### 3. DHT_FIND_VALUE / DHT_FOUND_VALUE
**Purpose**: Retrieve a value associated with a key.

**Request (DHT_FIND_VALUE)**:
```json
{
    "type": "DHT_FIND_VALUE",
    "key": "hex_encoded_160_bit_key"
}
```

**Response (DHT_FOUND_VALUE)** - If value exists:
```json
{
    "type": "DHT_FOUND_VALUE",
    "key": "hex_encoded_160_bit_key",
    "value": { /* any JSON-serializable data */ },
    "publisher": "revelnest_id",
    "timestamp": 1672531200000,
    "signature": "optional_signature_hex"
}
```

**Response (DHT_FOUND_NODES)** - If value not found:
- Returns the K closest nodes to the key (same format as DHT_FOUND_NODES)

### 4. DHT_STORE / DHT_STORE_ACK
**Purpose**: Store a key-value pair in the DHT.

**Request (DHT_STORE)**:
```json
{
    "type": "DHT_STORE",
    "key": "hex_encoded_160_bit_key",
    "value": { /* any JSON-serializable data */ },
    "publisher": "revelnest_id",
    "timestamp": 1672531200000,
    "signature": "optional_signature_hex"
}
```

**Response (DHT_STORE_ACK)**:
```json
{
    "type": "DHT_STORE_ACK",
    "key": "hex_encoded_160_bit_key"
}
```

### 5. Location Block Storage
**Specialization**: Storing node location information (IP address + DHT sequence).

**Key Derivation**: `SHA-256("location:" + revelnestId).slice(0, 20)`

**Value Format**:
```json
{
    "address": "200:xxxx:xxxx:xxxx::xxxx",
    "dhtSeq": 12345,
    "signature": "ed25519_signature_hex"
}
```

## Routing Algorithm

### 1. K-Buckets
- 160 buckets (indexed 0-159)
- Each bucket holds up to `K=20` contacts
- Contacts sorted by last-seen (LRU)
- Bucket index determined by XOR distance: `index = 159 - floor(log2(distance))`

### 2. Node Lookup (FIND_NODE)
1. Initialize result set with closest known nodes
2. Query `ALPHA=3` closest nodes in parallel
3. Update result set with responses
4. Repeat until no closer nodes are returned
5. Return K closest nodes

### 3. Value Lookup (FIND_VALUE)
1. Check local store first
2. If not found, perform node lookup to find closest nodes to key
3. Query nodes for value in parallel
4. If found, return value; otherwise return closest nodes

### 4. Value Storage (STORE)
1. Find K closest nodes to key
2. Send STORE request to each node
3. Wait for acknowledgments
4. Periodically republish (every 24 hours)

## Bootstrap Process

### Initialization
```typescript
// 1. Load existing contacts from database
const contacts = getContacts(); // SQLite query

// 2. Add to routing table
for (contact of contacts) {
    routingTable.addContact(contact);
}

// 3. Check if bootstrapped
const bootstrapped = routingTable.getContactCount() >= BOOTSTRAP_MIN_NODES;
```

### Seed Nodes
Seed nodes are pre-configured stable nodes that help new nodes join the network.

**Configuration**:
```typescript
const SEED_NODES = [
    {
        revelnestId: "802d20068fe07d3c3c16a15491210cd2",
        address: "200:1234:5678::1",
        publicKey: "ed25519_pubkey_hex"
    }
];
```

**Seed Discovery** (planned):
1. DNS TXT records: `_dht-seeds._udp.revelnest.chat`
2. HTTPS endpoint: `https://api.revelnest.chat/v1/seeds`
3. Local configuration file

### Bootstrap States
| State | Condition | Behavior |
|-------|-----------|----------|
| **Social Only** | 0-9 contacts | Use legacy DHT (broadcast to contacts) |
| **Partial Kademlia** | 10-19 contacts | Kademlia active but buckets incomplete |
| **Full Kademlia** | 20+ contacts | All buckets have K=20 nodes |

## Maintenance Operations

### 1. Bucket Refresh
- Each bucket refreshed every `REFRESH_INTERVAL_MS` (1 hour)
- Refresh: Perform FIND_NODE for random ID in bucket's range
- Keeps routing table healthy and discovers new nodes

### 2. Value Expiration
- Stored values expire after `TTL_MS` (30 days)
- Automatic cleanup during maintenance
- Publishers must republish before expiration

### 3. Bootstrap Retry
- If not bootstrapped, retry every `BOOTSTRAP_RETRY_MS` (30 seconds)
- Attempt to connect to seed nodes
- Update bootstrap status based on contact count

## Security Considerations

### 1. Signature Verification
- All DHT messages include Ed25519 signatures
- Signature covers entire message payload
- Invalid signatures result in message rejection

### 2. Location Block Security
- Location blocks signed by node's private key
- Sequence numbers prevent replay attacks
- Only accept blocks with higher sequence numbers

### 3. Sybil Resistance
- Node IDs derived from cryptographic keys
- Difficult to generate specific IDs due to hash function
- Social graph provides additional trust layer

## Integration with RevelNest

### Legacy DHT Compatibility
During migration, the system supports both Kademlia and legacy DHT protocols:

```typescript
// Hybrid handling in dht-handlers.ts
if (kademlia && kademlia.isBootstrapped()) {
    // Use Kademlia DHT
    return kademlia.handleMessage(...);
} else {
    // Fallback to legacy DHT (broadcast to contacts)
    handleLegacyDhtUpdate(...);
}
```

### Location Service
Primary use case: Storing and retrieving node location blocks for messaging.

```typescript
// Publish location when IP changes
await kademlia.storeLocationBlock(revelnestId, {
    address: newIp,
    dhtSeq: incrementedSequence,
    signature: ed25519Signature
});

// Find node location
const location = await kademlia.findLocationBlock(targetRevelnestId);
```

## Performance Characteristics

### Scalability
| Network Size | Lookup Hops | Messages per Store |
|--------------|-------------|-------------------|
| 10 nodes | ~2 | 20 |
| 1,000 nodes | ~7 | 20 |
| 100,000 nodes | ~10 | 20 |
| 1,000,000 nodes | ~13 | 20 |

### Comparison with Legacy DHT
| Metric | Legacy DHT | Kademlia DHT | Improvement |
|--------|------------|--------------|-------------|
| Messages per IP change | O(n) contacts | 20 (K=20) | 50x (for 1000 contacts) |
| Storage per node | O(n) contacts | O(K * log n) | ~30x (for 100k network) |
| Lookup complexity | O(n) | O(log n) | ~100x (for 100k network) |

## Implementation Architecture

### Modular Structure
```
src/main_process/network/kademlia/
├── index.ts              # Public API exports
├── main.ts              # KademliaDHT main class
├── types.ts             # Interfaces and constants
├── distance.ts          # XOR distance calculations
├── kbucket.ts           # K-bucket implementation
├── routing.ts           # Routing table management
├── store.ts             # Value storage with TTL
├── protocol.ts          # DHT message handlers
└── bootstrap.ts         # Bootstrap management
```

### Dependencies
- **Crypto**: Node.js crypto module for hashing
- **Database**: SQLite for contact persistence
- **Network**: Yggdrasil IPv6 mesh for transport
- **Cryptography**: libsodium (via sodium-native) for signatures

## Testing Strategy

### Unit Tests
- Individual component testing (k-buckets, distance calculations)
- Mock network layer for isolated testing
- 100% coverage of core algorithms

### Integration Tests
- Multi-node simulations (10+ nodes)
- Network partition scenarios
- Bootstrap and recovery tests

### System Tests
- Docker-based multi-container networks
- Real Yggdrasil networking
- Performance and load testing

## Future Improvements

### 1. Enhanced Bootstrap
- DHT-based seed discovery
- Peer exchange (PEX) protocol
- WebRTC signaling for NAT traversal

### 2. Advanced Routing
- Proximity-aware routing (latency-based)
- Multi-metric distance (network topology)
- Adaptive K values based on network density

### 3. Storage Optimizations
- Value compression and deduplication
- Bloom filters for existence queries
- Partial value retrieval

### 4. Security Enhancements
- Anonymous routing (onion routing)
- Denial-of-service protection
- Trust graphs for reputation

---

*Last Updated: Implementation Phase 12 - Kademlia DHT Refactoring*