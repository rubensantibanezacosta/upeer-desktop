import { K, REFRESH_INTERVAL_MS } from './types.js';
import { KademliaContact } from './types.js';
import { compareDistance } from './distance.js';

// K-bucket implementation
export class KBucket {
    private contacts: KademliaContact[] = [];
    private readonly maxSize: number;
    private lastUpdated: number = Date.now();

    constructor(maxSize: number = K) {
        this.maxSize = maxSize;
    }

    get size(): number {
        return this.contacts.length;
    }

    get all(): KademliaContact[] {
        return [...this.contacts];
    }

    // Add or update a contact (LRU)
    add(contact: KademliaContact): boolean {
        const index = this.contacts.findIndex(c => 
            c.upeerId === contact.upeerId
        );

        if (index !== -1) {
            // Update existing contact (move to end for LRU)
            this.contacts.splice(index, 1);
            this.contacts.push(contact);
        } else {
            if (this.contacts.length >= this.maxSize) {
                // Bucket is full, need to ping oldest contact
                // For now, we just remove the oldest
                this.contacts.shift();
            }
            this.contacts.push(contact);
        }
        
        this.lastUpdated = Date.now();
        return true;
    }

    remove(upeerId: string): boolean {
        const index = this.contacts.findIndex(c => c.upeerId === upeerId);
        if (index !== -1) {
            this.contacts.splice(index, 1);
            return true;
        }
        return false;
    }

    findClosest(targetId: Buffer, limit: number = K): KademliaContact[] {
        return this.contacts
            .sort((a, b) => compareDistance(a.nodeId, b.nodeId, targetId))
            .slice(0, limit);
    }

    needsRefresh(): boolean {
        return Date.now() - this.lastUpdated > REFRESH_INTERVAL_MS;
    }
}