import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValueStore, createLocationBlockKey, createVaultPointerKey } from '../../../src/main_process/network/dht/kademlia/store.js';

describe('Kademlia ValueStore', () => {
    let store: ValueStore;

    beforeEach(() => {
        store = new ValueStore();
    });

    it('should store and retrieve values', () => {
        const key = Buffer.from('test-key-12345678901234567890');
        const value = { data: 'hello' };
        store.set(key, value, 'peer1', 'sig1');

        const retrieved = store.get(key);
        expect(retrieved).not.toBeNull();
        expect(retrieved?.value).toEqual(value);
        expect(retrieved?.publisher).toBe('peer1');
        expect(retrieved?.signature).toBe('sig1');
        expect(store.has(key)).toBe(true);
    });

    it('should delete keys', () => {
        const key = Buffer.from('delete-me-12345678901234567890');
        store.set(key, 'val', 'p');
        expect(store.has(key)).toBe(true);
        expect(store.delete(key)).toBe(true);
        expect(store.has(key)).toBe(false);
        expect(store.get(key)).toBeNull();
        expect(store.delete(key)).toBe(false);
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
        vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 31); // 31 days

        const removed = store.cleanupExpiredValues();
        expect(removed).toBe(1);
        expect(store.has(key)).toBe(false);

        vi.useRealTimers();
    });

    it('should return all values with getAll', () => {
        const k1 = Buffer.from('k1-12345678901234567890');
        const k2 = Buffer.from('k2-12345678901234567890');
        store.set(k1, 'v1', 'p1');
        store.set(k2, 'v2', 'p2');

        const all = store.getAll();
        expect(all).toHaveLength(2);
        expect(all[0].value).toBe('v1');
        expect(all[1].value).toBe('v2');
    });

    describe('key creation helpers', () => {
        it('should create valid LocationBlock keys', () => {
            const k = createLocationBlockKey('upeer1');
            expect(Buffer.isBuffer(k)).toBe(true);
            expect(k.length).toBe(20);
        });

        it('should create valid Vault Pointer keys', () => {
            const k = createVaultPointerKey('recipient1');
            expect(Buffer.isBuffer(k)).toBe(true);
            expect(k.length).toBe(20);
        });

        it('should create unique Vault Pointer keys each day', () => {
            const k1 = createVaultPointerKey('recipient1');

            vi.useFakeTimers();
            vi.setSystemTime(new Date('2025-01-01'));
            const kA = createVaultPointerKey('recipient1');

            vi.setSystemTime(new Date('2025-01-02'));
            const kB = createVaultPointerKey('recipient1');

            expect(kA.toString('hex')).not.toBe(kB.toString('hex'));
            vi.useRealTimers();
        });
    });
});
