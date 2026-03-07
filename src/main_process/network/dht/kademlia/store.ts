import crypto from 'node:crypto';
import { ID_LENGTH_BYTES, TTL_MS, StoredValue } from './types.js';

// Local value store for Kademlia DHT (no encryption for DHT metadata)
export class ValueStore {
    private store: Map<string, StoredValue> = new Map();

    // Store a value
    set(key: Buffer, value: any, publisher: string, signature?: string): void {
        const storedEntry: StoredValue = {
            key,
            value,
            publisher,
            timestamp: Date.now(),
            signature
        };
        
        const keyHex = key.toString('hex');
        this.store.set(keyHex, storedEntry);
    }

    // Get a value by key
    get(key: Buffer): StoredValue | null {
        const keyHex = key.toString('hex');
        return this.store.get(keyHex) || null;
    }

    // Check if a key exists
    has(key: Buffer): boolean {
        const keyHex = key.toString('hex');
        return this.store.has(keyHex);
    }

    // Delete a value
    delete(key: Buffer): boolean {
        const keyHex = key.toString('hex');
        return this.store.delete(keyHex);
    }

    // Clean up expired values with auto-renewal capability
    cleanupExpiredValues(): number {
        const now = Date.now();
        let removed = 0;
        let renewed = 0;
        
        for (const [key, value] of this.store.entries()) {
            if (now - value.timestamp > TTL_MS) {
                // Check if this is a location block that can be renewed
                if (value.value && value.value.address && value.value.signature) {
                    // Check if block has renewal token
                    if (value.value.renewalToken) {
                        // Verify renewal token is still valid
                        const token = value.value.renewalToken;
                        if (token.allowedUntil > now && token.renewalsUsed < token.maxRenewals) {
                            // Auto-renew the block
                            const renewedBlock = { ...value.value };
                            renewedBlock.expiresAt = now + TTL_MS; // Extend 30 more days
                            token.renewalsUsed += 1;
                            
                            // Update the stored value
                            this.store.set(key, {
                                ...value,
                                value: renewedBlock,
                                timestamp: now // Reset timestamp
                            });
                            renewed++;
                            continue;
                        }
                    }
                    // If no renewal token or token expired, delete
                    this.store.delete(key);
                    removed++;
                } else {
                    this.store.delete(key);
                    removed++;
                }
            }
        }
        
        if (renewed > 0) {
            console.log(`[Kademlia] Auto-renewed ${renewed} location blocks`);
        }
        
        return removed;
    }

    // Get all stored values (for debugging/maintenance)
    getAll(): StoredValue[] {
        return Array.from(this.store.values());
    }

    // Get size of store
    size(): number {
        return this.store.size;
    }
}

// Helper function to create LocationBlock key
export function createLocationBlockKey(revelnestId: string): Buffer {
    // Key for location blocks: hash of "location:" + revelnestId
    const hash = crypto.createHash('sha256');
    hash.update(`location:${revelnestId}`);
    return hash.digest().slice(0, ID_LENGTH_BYTES);
}