import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValueStore } from '../../../src/main_process/network/dht/kademlia/store.js';

describe('Kademlia ValueStore', () => {
    let store: ValueStore;

    beforeEach(() => {
        store = new ValueStore();
    });

    it('should store and retrieve values', () => {
        const key = Buffer.from('test-key-12345678901234567890');
        const value = { data: 'hello' };
        store.set(key, value, 'peer1');

        const retrieved = store.get(key);
        expect(retrieved).not.toBeNull();
        expect(retrieved?.value).toEqual(value);
        expect(retrieved?.publisher).toBe('peer1');
    });

    it('should respect MAX_STORE_ENTRIES and evict oldest', () => {
        // Mocking Date.now is not enough here because it uses map insertion order for eviction
        // let's just push 10001 entries.
        const MAX = 10000;

        // Add 10000 entries
        for (let i = 0; i < MAX; i++) {
            const k = Buffer.alloc(20);
            k.writeUInt32BE(i, 0);
            store.set(k, `val-${i}`, 'peer');
        }

        expect(store.size()).toBe(MAX);

        // The first key should be 0
        const firstKey = Buffer.alloc(20);
        firstKey.writeUInt32BE(0, 0);
        expect(store.has(firstKey)).toBe(true);

        // Add one more
        const extraKey = Buffer.alloc(20);
        extraKey.writeUInt32BE(MAX + 1, 0);
        store.set(extraKey, 'extra', 'peer');

        expect(store.size()).toBe(MAX);
        expect(store.has(firstKey)).toBe(false); // Should have been evicted
        expect(store.has(extraKey)).toBe(true);
    });

    it('should handle updates to existing keys without evicting', () => {
        const MAX = 10000;
        for (let i = 0; i < MAX; i++) {
            const k = Buffer.alloc(20);
            k.writeUInt32BE(i, 0);
            store.set(k, `val-${i}`, 'peer');
        }

        const firstKey = Buffer.alloc(20);
        firstKey.writeUInt32BE(0, 0);

        // Update the first key
        store.set(firstKey, 'updated', 'peer');

        expect(store.size()).toBe(MAX);
        expect(store.has(firstKey)).toBe(true);
        expect(store.get(firstKey)?.value).toBe('updated');
    });

    it('should correctly identify expired values', () => {
        const now = Date.now();
        vi.useFakeTimers();
        vi.setSystemTime(now);

        const key = Buffer.from('expire-me');
        store.set(key, 'val', 'peer');

        // Fast forward 31 days (TTL is usually around that)
        // Let's check TTL_MS from types or assume standard 24h/30d
        // If I don't know TTL_MS, I'll check it or just jump a lot.
        vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 31); // 31 days

        const removed = store.cleanupExpiredValues();
        expect(removed).toBe(1);
        expect(store.has(key)).toBe(false);

        vi.useRealTimers();
    });
});
