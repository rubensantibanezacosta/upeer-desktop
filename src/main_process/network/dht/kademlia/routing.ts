import { KBucket } from './kbucket.js';
import { KademliaContact } from './types.js';
import { toKademliaId } from './types.js';
import { getBucketIndex } from './distance.js';
import { BUCKET_COUNT } from './types.js';
import { K } from './types.js';
import { compareDistance } from './distance.js';

// Routing table for Kademlia DHT
export class RoutingTable {
    private readonly nodeId: Buffer;
    private buckets: KBucket[];

    constructor(nodeId: Buffer) {
        this.nodeId = nodeId;
        
        // Initialize k-buckets
        this.buckets = new Array(BUCKET_COUNT);
        for (let i = 0; i < BUCKET_COUNT; i++) {
            this.buckets[i] = new KBucket();
        }
    }

    // Add a contact to the appropriate bucket
    addContact(contact: KademliaContact): boolean {
        // Don't add ourselves
        if (contact.nodeId.equals(this.nodeId)) return false;
        
        const bucketIndex = getBucketIndex(this.nodeId, contact.nodeId);
        return this.buckets[bucketIndex].add(contact);
    }

    // Remove a contact
    removeContact(revelnestId: string): boolean {
        const contact = this.findContact(revelnestId);
        if (!contact) return false;
        
        const bucketIndex = getBucketIndex(this.nodeId, contact.nodeId);
        return this.buckets[bucketIndex].remove(revelnestId);
    }

    // Find a contact by RevelNest ID
    findContact(revelnestId: string): KademliaContact | null {
        const targetId = toKademliaId(revelnestId);
        const bucketIndex = getBucketIndex(this.nodeId, targetId);
        
        const bucket = this.buckets[bucketIndex];
        return bucket.all.find(c => c.revelnestId === revelnestId) || null;
    }

    // Find the K closest contacts to a given ID
    findClosestContacts(targetRevelnestId: string, limit: number = K): KademliaContact[] {
        const targetId = toKademliaId(targetRevelnestId);
        const allContacts: KademliaContact[] = [];
        
        // Collect contacts from all buckets
        for (const bucket of this.buckets) {
            allContacts.push(...bucket.all);
        }
        
        // Sort by XOR distance and return closest
        return allContacts
            .sort((a, b) => compareDistance(a.nodeId, b.nodeId, targetId))
            .slice(0, limit);
    }

    // Get total number of contacts
    getContactCount(): number {
        let total = 0;
        for (const bucket of this.buckets) {
            total += bucket.size;
        }
        return total;
    }

    // Get all contacts (for debugging)
    getAllContacts(): KademliaContact[] {
        const allContacts: KademliaContact[] = [];
        for (const bucket of this.buckets) {
            allContacts.push(...bucket.all);
        }
        return allContacts;
    }

    // Refresh buckets that need refreshing
    refreshStaleBuckets(): number[] {
        const refreshed: number[] = [];
        for (let i = 0; i < this.buckets.length; i++) {
            if (this.buckets[i].needsRefresh()) {
                refreshed.push(i);
            }
        }
        return refreshed;
    }

    // Get bucket by index (for debugging)
    getBucket(index: number): KBucket {
        return this.buckets[index];
    }

    // Get number of buckets
    getBucketCount(): number {
        return this.buckets.length;
    }
}