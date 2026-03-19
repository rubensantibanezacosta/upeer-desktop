import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KademliaDHT } from '../../../src/main_process/network/dht/kademlia/main.js';
import { RoutingTable } from '../../../src/main_process/network/dht/kademlia/routing.js';
import { ValueStore } from '../../../src/main_process/network/dht/kademlia/store.js';
import { BootstrapManager } from '../../../src/main_process/network/dht/kademlia/bootstrap.js';
import { ProtocolHandler } from '../../../src/main_process/network/dht/kademlia/protocol.js';

// Mocks
vi.mock('../../../src/main_process/network/dht/kademlia/routing.js');
vi.mock('../../../src/main_process/network/dht/kademlia/store.js');
vi.mock('../../../src/main_process/network/dht/kademlia/bootstrap.js');
vi.mock('../../../src/main_process/network/dht/kademlia/protocol.js');
vi.mock('../../../src/main_process/security/secure-logger.js');

describe('KademliaDHT Unit Tests', () => {
    const upeerId = '0123456789abcdef0123456789abcdef01234567'; // Valid hex for toKademliaId
    const sendMessage = vi.fn();
    const getContacts = vi.fn();
    const userDataPath = '/tmp/test';

    let dht: KademliaDHT;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup default behaviors for mocks
        vi.mocked(BootstrapManager.prototype.bootstrapFromContacts).mockReturnValue(5);
        vi.mocked(BootstrapManager.prototype.isBootstrapped).mockReturnValue(true);
        vi.mocked(BootstrapManager.prototype.getContactCount).mockReturnValue(5);
        vi.mocked(BootstrapManager.prototype.getStats).mockReturnValue({} as any);

        vi.mocked(ProtocolHandler.prototype.getStats).mockReturnValue({} as any);
        vi.mocked(RoutingTable.prototype.getBucketCount).mockReturnValue(10);
        vi.mocked(ValueStore.prototype.size).mockReturnValue(0);

        dht = new KademliaDHT(upeerId, sendMessage, getContacts, userDataPath);
    });

    it('should initialize all components and bootstrap', () => {
        expect(RoutingTable).toHaveBeenCalled();
        expect(ValueStore).toHaveBeenCalled();
        expect(BootstrapManager).toHaveBeenCalled();
        expect(ProtocolHandler).toHaveBeenCalled();
        expect(BootstrapManager.prototype.bootstrapFromContacts).toHaveBeenCalled();
    });

    it('should check if bootstrapped', () => {
        expect(dht.isBootstrapped()).toBe(true);
        expect(BootstrapManager.prototype.isBootstrapped).toHaveBeenCalled();
    });

    it('should get contact count', () => {
        expect(dht.getContactCount()).toBe(5);
        expect(BootstrapManager.prototype.getContactCount).toHaveBeenCalled();
    });

    it('should retry bootstrap', () => {
        dht.retryBootstrap();
        expect(BootstrapManager.prototype.retryBootstrap).toHaveBeenCalled();
    });

    it('should add contact and update bootstrap status', () => {
        const contact = { upeerId: upeerId, address: 'addr' } as any;
        dht.addContact(contact);
        expect(RoutingTable.prototype.addContact).toHaveBeenCalledWith(contact);
        expect(BootstrapManager.prototype.updateBootstrapStatus).toHaveBeenCalled();
    });

    it('should remove contact and update bootstrap status', () => {
        dht.removeContact(upeerId);
        expect(RoutingTable.prototype.removeContact).toHaveBeenCalledWith(upeerId);
        expect(BootstrapManager.prototype.updateBootstrapStatus).toHaveBeenCalled();
    });

    it('should find contact', () => {
        const contact = { upeerId: upeerId } as any;
        vi.mocked(RoutingTable.prototype.findContact).mockReturnValue(contact);
        expect(dht.findContact(upeerId)).toBe(contact);
    });

    it('should find closest contacts', () => {
        const contacts = [{ upeerId: 'c1' }] as any;
        vi.mocked(RoutingTable.prototype.findClosestContacts).mockReturnValue(contacts);
        expect(dht.findClosestContacts(upeerId, 10)).toBe(contacts);
        expect(RoutingTable.prototype.findClosestContacts).toHaveBeenCalledWith(upeerId, 10);
    });

    it('should store value via protocol handler', async () => {
        const key = Buffer.from('key');
        const value = 'data';
        await dht.storeValue(key, value, 'pub', 'sig');
        expect(ProtocolHandler.prototype.storeValue).toHaveBeenCalledWith(key, value, 'pub', 'sig');

        const stats = dht.getStats();
        expect(stats.storeOperations).toBe(1);
    });

    it('should find value via protocol handler', async () => {
        const key = Buffer.from('key');
        vi.mocked(ProtocolHandler.prototype.findValue).mockResolvedValue('result' as any);
        const res = await dht.findValue(key);
        expect(res).toBe('result');
        expect(ProtocolHandler.prototype.findValue).toHaveBeenCalledWith(key);

        const stats = dht.getStats();
        expect(stats.findOperations).toBe(1);
    });

    it('should handle location blocks', async () => {
        const loc = { signature: 'sig1' };
        await dht.storeLocationBlock(upeerId, loc);
        expect(ProtocolHandler.prototype.storeValue).toHaveBeenCalled();

        vi.mocked(ProtocolHandler.prototype.findValue).mockResolvedValue({ value: 'found-data' } as any);
        const found = await dht.findLocationBlock(upeerId);
        expect(found).toBe('found-data');
    });

    it('should return null if location block value is missing', async () => {
        vi.mocked(ProtocolHandler.prototype.findValue).mockResolvedValue(null);
        const found = await dht.findLocationBlock(upeerId);
        expect(found).toBeNull();
    });

    it('should delegate message handling', async () => {
        await dht.handleMessage('sender', { type: 'DHT_PING' }, 'addr');
        expect(ProtocolHandler.prototype.handleMessage).toHaveBeenCalledWith('sender', { type: 'DHT_PING' }, 'addr');
    });

    it('should perform periodic maintenance', async () => {
        vi.mocked(BootstrapManager.prototype.isBootstrapped).mockReturnValue(false);
        vi.mocked(BootstrapManager.prototype.getTimeSinceLastAttempt).mockReturnValue(10000000); // Trigger retry
        vi.mocked(RoutingTable.prototype.refreshStaleBuckets).mockReturnValue([1, 2]);
        vi.mocked(ValueStore.prototype.cleanupExpiredValues).mockReturnValue(3);

        await dht.performMaintenance();

        expect(BootstrapManager.prototype.retryBootstrap).toHaveBeenCalled();
        expect(RoutingTable.prototype.refreshStaleBuckets).toHaveBeenCalled();
        expect(ValueStore.prototype.cleanupExpiredValues).toHaveBeenCalled();
    });

    it('should skip bootstrap retry during maintenance if already bootstrapped', async () => {
        vi.mocked(BootstrapManager.prototype.isBootstrapped).mockReturnValue(true);
        await dht.performMaintenance();
        expect(BootstrapManager.prototype.retryBootstrap).not.toHaveBeenCalled();
    });

    it('should skip bootstrap retry during maintenance if too soon', async () => {
        vi.mocked(BootstrapManager.prototype.isBootstrapped).mockReturnValue(false);
        vi.mocked(BootstrapManager.prototype.getTimeSinceLastAttempt).mockReturnValue(0);
        await dht.performMaintenance();
        expect(BootstrapManager.prototype.retryBootstrap).not.toHaveBeenCalled();
    });

    it('should collect stats from all components', () => {
        vi.mocked(ProtocolHandler.prototype.getStats).mockReturnValue({ proto: 'stat' } as any);
        vi.mocked(BootstrapManager.prototype.getStats).mockReturnValue({ boot: 'stat' } as any);

        const stats = dht.getStats();
        expect(stats).toMatchObject({
            proto: 'stat',
            boot: 'stat',
            totalContacts: 5,
            totalBuckets: 10,
            storedValues: 0
        });
    });
});
