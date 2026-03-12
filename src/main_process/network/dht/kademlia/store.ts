import crypto from 'node:crypto';
import { ID_LENGTH_BYTES, TTL_MS, StoredValue } from './types.js';
import { debug } from '../../../security/secure-logger.js';

// Local value store for Kademlia DHT (no encryption for DHT metadata)
// BUG CS fix: límite duro de entradas para evitar OOM. Con rate-limit de 10 DHT_STORE/min
// por peer y TTL de 30 días, un único contacto podría acumular 432 000 entradas × 10 KB = 4.3 GB.
// MAX_STORE_ENTRIES cota la tienda en RAM; las entradas más antiguas se desalojan al llenarse.
const MAX_STORE_ENTRIES = 10_000;

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
        // Si la clave ya existe, solo actualizar (no aumenta el tamaño del mapa).
        // Si es nueva y alcanzamos el límite, desalojar la entrada más antigua.
        if (!this.store.has(keyHex) && this.store.size >= MAX_STORE_ENTRIES) {
            const oldestKey = this.store.keys().next().value;
            if (oldestKey) this.store.delete(oldestKey);
            debug('ValueStore full — evicted oldest entry', { size: this.store.size }, 'kademlia');
        }
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

    // Clean up expired values
    cleanupExpiredValues(): number {
        const now = Date.now();
        let removed = 0;

        for (const [key, value] of this.store.entries()) {
            if (now - value.timestamp > TTL_MS) {
                // BUG BS fix: el bloque anterior intentaba modificar expiresAt del
                // LocationBlock para extender su vida. Esto es incorrecto: expiresAt
                // forma parte de los datos firmados por el propietario
                // ({upeerId, address, dhtSeq, expiresAt}). Mutarlo invalida la
                // firma → cualquier peer que recibiera el bloque lo rechazaba.
                // La renovación correcta ocurre via VAULT_RENEW (handlers.ts) donde
                // el propietario firma un nuevo bloque. El nodo Kademlia simplemente
                // borra la entrada expirada y espera la republication (cada 24h).
                //
                // BUG BR fix: console.log en producción reemplazado por debug().
                this.store.delete(key);
                removed++;
            }
        }

        if (removed > 0) {
            debug('Kademlia ValueStore: expired entries removed', { removed }, 'kademlia');
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
export function createLocationBlockKey(upeerId: string): Buffer {
    // Key for location blocks: hash of "location:" + upeerId
    const hash = crypto.createHash('sha256');
    hash.update(`location:${upeerId}`);
    return hash.digest().slice(0, ID_LENGTH_BYTES);
}

// Helper function to create Vault Pointer key
export function createVaultPointerKey(recipientSid: string): Buffer {
    // Key for vault pointers: hash of "vault-ptr:" + upeerId
    const hash = crypto.createHash('sha256');
    hash.update(`vault-ptr:${recipientSid}`);
    return hash.digest().slice(0, ID_LENGTH_BYTES);
}