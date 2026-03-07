// Main entry point for Kademlia DHT - re-export from modular implementation
export { 
    KademliaDHT,
    toKademliaId,
    xorDistance,
    createLocationBlockKey
} from './index.js';

export type {
    KademliaContact,
    StoredValue
} from './index.js';