# RevelNest Documentation

This directory contains technical documentation for the RevelNest Chat P2P project.

## Protocol Documentation

### [DHT Kademlia Protocol](./DHT_KADEMLIA_PROTOCOL.md)
Complete specification of the Kademlia Distributed Hash Table implementation used for decentralized node discovery and location storage.

### Network Protocols (Planned)
- **Messaging Protocol**: End-to-end encrypted chat messages, ACKs, reactions
- **Handshake Protocol**: Secure contact addition and identity verification  
- **Presence Protocol**: Online status, typing indicators, last seen
- **File Transfer Protocol**: Distributed file sharing with fragment protocol

## Architecture Documentation

### Modular Kademlia Implementation
The Kademlia DHT has been refactored into a modular architecture:

```
src/main_process/network/kademlia/
├── index.ts              # Public API exports
├── main.ts              # KademliaDHT main class (integrated components)
├── types.ts             # Interfaces, constants, and type definitions
├── distance.ts          # XOR distance calculations and bucket indexing
├── kbucket.ts           # K-bucket implementation (LRU, size limits)
├── routing.ts           # Routing table management (160 k-buckets)
├── store.ts             # Value storage with TTL and cleanup
├── protocol.ts          # DHT message handlers (PING, FIND_NODE, STORE, etc.)
└── bootstrap.ts         # Bootstrap management and seed nodes
```

### Key Changes in Phase 12
1. **Scalability**: Reduced broadcast messages from O(n) to O(k×log n)
2. **Bootstrap**: Increased minimum nodes from 5 to 10 for reliable DHT operation
3. **TTL**: Extended value expiration from 48 hours to 30 days
4. **Modularity**: Refactored monolithic class into cohesive components

## Testing Strategy

### Unit Tests
- `tests/kademlia.test.ts`: Core functionality testing
- Isolated component testing with mocked dependencies

### Integration Tests  
- `tests/kademlia-integration.test.ts`: Multi-node simulation (10+ nodes)
- Mock network layer for controlled testing environments

### System Tests
- Docker-based multi-container networks (`tests/p2p_testing/`)
- Real Yggdrasil networking with isolated containers
- Performance and load testing scripts

## Development Guidelines

### Adding New DHT Features
1. Extend protocol in `protocol.ts` for new message types
2. Update `types.ts` with new interfaces and constants
3. Add routing logic in `routing.ts` if needed
4. Write tests in both unit and integration test suites
5. Update documentation in `DHT_KADEMLIA_PROTOCOL.md`

### Bootstrap Configuration
Seed nodes can be configured in `src/main_process/network/kademlia/types.ts`:
```typescript
export const SEED_NODES: SeedNode[] = [
    {
        revelnestId: "802d20068fe07d3c3c16a15491210cd2",
        address: "200:xxxx:xxxx:xxxx::xxxx",
        publicKey: "ed25519_pubkey_hex"
    }
];
```

In production, seed nodes should be loaded dynamically from:
1. DNS TXT records (`_dht-seeds._udp.revelnest.chat`)
2. HTTPS endpoint (`https://api.revelnest.chat/v1/seeds`)
3. Local configuration file

## Performance Targets

### Network Scalability
| Network Size | Lookup Hops | Messages/Update | Storage/Node |
|--------------|-------------|-----------------|--------------|
| 100 nodes | ~4 | 20 | ~500 contacts |
| 10,000 nodes | ~7 | 20 | ~340 contacts |
| 1,000,000 nodes | ~13 | 20 | ~400 contacts |

### Comparison with Legacy System
| Metric | Improvement Factor |
|--------|-------------------|
| Messages per IP change | 50× (for 1000 contacts) |
| Storage per node | 30× (for 100k network) |
| Lookup time | 100× (for 100k network) |

## Maintenance

### Regular Maintenance Tasks
1. **Bucket Refresh**: Automatic every hour
2. **Value Expiration**: Automatic cleanup of 30+ day old values
3. **Bootstrap Health**: Periodic seed node connectivity checks
4. **Statistics Monitoring**: Log DHT metrics for performance analysis

### Monitoring
Key metrics to monitor:
- `totalContacts`: Number of nodes in routing table
- `storedValues`: Number of values stored locally
- `messagesSent/Received`: Network traffic
- `bootstrapSuccesses`: Successful bootstrap attempts

## Future Roadmap

### Phase 12.1: Enhanced Bootstrap
- DHT-based seed discovery
- Peer exchange (PEX) protocol
- WebRTC signaling for NAT traversal

### Phase 12.2: Advanced Features
- Proximity-aware routing (latency-based)
- Value compression and deduplication
- Anonymous routing options

### Phase 12.3: Production Readiness
- Load testing with 10,000+ simulated nodes
- Security audit and penetration testing
- Monitoring dashboard integration

---

*Last Updated: Implementation Phase 12 - Kademlia DHT Refactoring*