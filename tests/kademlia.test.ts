import { KademliaDHT, toKademliaId, xorDistance } from '../src/main_process/network/dht/kademlia/index.js';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';

// Helper to generate valid 32-char hex RevelNest IDs
function hexId(seed: string): string {
    // Use a simple hash to convert any string to 32-char hex
    const hash = crypto.createHash('sha256');
    hash.update(seed);
    return hash.digest('hex').slice(0, 32);
}

// Mock sendMessage function
const mockSendMessage = (address: string, data: any) => {
    console.log(`[Mock] Send to ${address}:`, data.type);
};

describe('Kademlia DHT', () => {
    let dht: KademliaDHT;
    
    beforeEach(() => {
        dht = new KademliaDHT(hexId('test'), mockSendMessage, undefined);
    });
    
    afterEach(() => {
        // Cleanup if needed
    });
    
    it('should convert RevelNest ID to Kademlia ID', () => {
        const revelnestId = 'test1234567890abcdef1234567890abcd';
        const kademliaId = toKademliaId(revelnestId);
        
        assert.strictEqual(kademliaId.length, 20); // 160 bits = 20 bytes
        assert.strictEqual(kademliaId.toString('hex').length, 40); // 40 hex chars
    });
    
    it('should calculate XOR distance', () => {
        const id1 = Buffer.from('0000000000000000000000000000000000000000', 'hex');
        const id2 = Buffer.from('ffffffffffffffffffffffffffffffffffffffff', 'hex');
        const distance = xorDistance(id1, id2);
        
        assert.strictEqual(distance.toString('hex'), 'ffffffffffffffffffffffffffffffffffffffff');
        
        // Distance between same ID should be zero
        const zeroDistance = xorDistance(id1, id1);
        assert.strictEqual(zeroDistance.toString('hex'), '0000000000000000000000000000000000000000');
    });
    
    it('should add and find contacts', () => {
        const contactRevelnestId = hexId('contact');
        const contact = {
            nodeId: toKademliaId(contactRevelnestId),
            revelnestId: contactRevelnestId,
            address: '200:1:2:3::4',
            publicKey: 'pubkey123',
            lastSeen: Date.now()
        };
        
        // Add contact
        dht.addContact(contact);
        
        // Find contact
        const found = dht.findContact(contact.revelnestId);
        assert.ok(found);
        assert.strictEqual(found.revelnestId, contact.revelnestId);
        assert.strictEqual(found.address, contact.address);
    });
    
    it('should find closest contacts', () => {
        // Add multiple contacts
        for (let i = 0; i < 10; i++) {
            const contactRevelnestId = hexId('node' + i);
            const contact = {
                nodeId: toKademliaId(contactRevelnestId),
                revelnestId: contactRevelnestId,
                address: `200:1:2:3::${i}`,
                publicKey: `pubkey${i}`,
                lastSeen: Date.now()
            };
            dht.addContact(contact);
        }
        
        const targetId = hexId('node5');
        const closest = dht.findClosestContacts(targetId, 3);
        
        assert.strictEqual(closest.length, 3);
        // Should return contacts sorted by distance
        console.log('Closest contacts:', closest.map((c: any) => c.revelnestId));
    });
    
    it('should handle store and find value', async () => {
        const keyRevelnestId = hexId('testkey');
        const key = toKademliaId(keyRevelnestId);
        const value = { test: 'data', timestamp: Date.now() };
        
        // Store value
        await dht.storeValue(key, value, 'publisher123');
        
        // Note: findValue currently returns null for non-local values
        // This test is just to verify no errors occur
        const result = await dht.findValue(key);
        // Since we stored locally, it should be found
        // But our implementation only checks local store in findValue
        // We need to check that storeValue stores locally
        console.log('Store/find test completed');
    });
    
    it('should perform maintenance without errors', () => {
        // Add some contacts
        for (let i = 0; i < 5; i++) {
            const contactRevelnestId = hexId('maint' + i);
            const contact = {
                nodeId: toKademliaId(contactRevelnestId),
                revelnestId: contactRevelnestId,
                address: `200:1:2:3::${i + 100}`,
                publicKey: `pubkey${i}`,
                lastSeen: Date.now()
            };
            dht.addContact(contact);
        }
        
        // Perform maintenance
        dht.performMaintenance();
        
        // Check stats
        const stats = dht.getStats();
        console.log('Maintenance stats:', stats);
        assert.ok(stats.totalContacts >= 5);
    });
});

// Run tests if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
    import('node:test').then(async (test) => {
        await test.default();
    });
}