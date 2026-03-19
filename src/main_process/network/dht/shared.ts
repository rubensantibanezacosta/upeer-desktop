import { KademliaDHT } from './kademlia/main.js';

// Global Kademlia DHT instance (will be initialized in server.ts)
let kademlia: KademliaDHT | null = null;

export function setKademliaInstance(instance: KademliaDHT) {
    kademlia = instance;
}

export function getKademliaInstance(): KademliaDHT | null {
    return kademlia;
}