import { describe, it, expect, vi, beforeEach } from 'vitest';
import dns from 'node:dns';
import fs from 'node:fs';
import { BootstrapManager } from '../../../src/main_process/network/dht/kademlia/bootstrap.js';
import type { KademliaContact, SeedNode } from '../../../src/main_process/network/dht/kademlia/types.js';

type MockRoutingTable = {
    addContact: (contact: KademliaContact) => boolean;
    getContactCount: () => number;
};
type SendMessage = ConstructorParameters<typeof BootstrapManager>[1];
type BootstrapManagerInternals = {
    loadSeedNodesFromDNS: () => Promise<SeedNode[]>;
    loadSeedNodes: () => Promise<SeedNode[]>;
    loadSeedNodesFromFile: () => Promise<SeedNode[]>;
    attemptBootstrapFromSeeds: () => Promise<void>;
};

const createBootstrapManager = (...args: ConstructorParameters<typeof BootstrapManager>) => new BootstrapManager(...args);
const bootstrapInternalsCache = new WeakMap<BootstrapManager, BootstrapManagerInternals>();

function getInternals(manager: BootstrapManager): BootstrapManagerInternals {
    const cached = bootstrapInternalsCache.get(manager);
    if (cached) return cached;

    const internals: BootstrapManagerInternals = {
        loadSeedNodesFromDNS: Reflect.get(manager, 'loadSeedNodesFromDNS').bind(manager) as BootstrapManagerInternals['loadSeedNodesFromDNS'],
        loadSeedNodes: Reflect.get(manager, 'loadSeedNodes').bind(manager) as BootstrapManagerInternals['loadSeedNodes'],
        loadSeedNodesFromFile: Reflect.get(manager, 'loadSeedNodesFromFile').bind(manager) as BootstrapManagerInternals['loadSeedNodesFromFile'],
        attemptBootstrapFromSeeds: Reflect.get(manager, 'attemptBootstrapFromSeeds').bind(manager) as BootstrapManagerInternals['attemptBootstrapFromSeeds'],
    };

    bootstrapInternalsCache.set(manager, internals);
    return internals;
}

vi.mock('node:dns', () => ({
    default: {
        promises: {
            resolveTxt: vi.fn()
        }
    }
}));

vi.mock('node:fs', () => ({
    default: {
        existsSync: vi.fn(),
        readFileSync: vi.fn()
    }
}));

vi.mock('../../../src/main_process/network/dht/kademlia/routing.js', () => ({
    RoutingTable: vi.fn()
}));

describe('BootstrapManager Unit Tests', () => {
    let bootstrapManager: BootstrapManager;
    let mockRoutingTable: MockRoutingTable;
    let mockSendMessage: ReturnType<typeof vi.fn<SendMessage>>;
    let mockAddContact: ReturnType<typeof vi.fn<(contact: KademliaContact) => boolean>>;
    let mockGetContactCount: ReturnType<typeof vi.fn<() => number>>;
    const userDataPath = '/tmp/upeer-test';

    beforeEach(() => {
        vi.clearAllMocks();
        mockAddContact = vi.fn(() => true);
        mockGetContactCount = vi.fn().mockReturnValue(0);
        mockRoutingTable = {
            addContact: mockAddContact,
            getContactCount: mockGetContactCount,
        };
        mockSendMessage = vi.fn();
        bootstrapManager = createBootstrapManager(mockRoutingTable as object as ConstructorParameters<typeof BootstrapManager>[0], mockSendMessage, undefined, userDataPath);
    });

    it('should initialize correctly', () => {
        expect(bootstrapManager).toBeDefined();
    });

    describe('loadSeedNodesFromDNS', () => {
        it('should load seed nodes from DNS correctly', async () => {
            const mockDnsRecord = [['upeerId=seed1;address=1.1.1.1;publicKey=pub1']];
            vi.mocked(dns.promises.resolveTxt).mockResolvedValue(mockDnsRecord);

            const seeds = await getInternals(bootstrapManager).loadSeedNodesFromDNS();

            expect(seeds).toHaveLength(1);
            expect(seeds[0].upeerId).toBe('seed1');
            expect(seeds[0].address).toBe('1.1.1.1');
            expect(seeds[0].publicKey).toBe('pub1');
        });

        it('should handle malformed DNS records gracefully', async () => {
            const mockDnsRecord = [
                ['malformed-record'],
                ['upeerId=seed2;address=2.2.2.2;publicKey=pub2'],
                ['upeerId=;address=3.3.3.3;publicKey='], // Partial
                ['invalid=key;value=pair'], // Bad format
                ['upeerId=seed_partial;address=4.4.4.4'] // Missing publicKey
            ];
            vi.mocked(dns.promises.resolveTxt).mockResolvedValue(mockDnsRecord);

            const seeds = await getInternals(bootstrapManager).loadSeedNodesFromDNS();

            expect(seeds).toHaveLength(1);
            expect(seeds[0].upeerId).toBe('seed2');
        });

        it('should return empty array if DNS resolution fails', async () => {
            vi.mocked(dns.promises.resolveTxt).mockRejectedValue(new Error('DNS Error'));
            const seeds = await getInternals(bootstrapManager).loadSeedNodesFromDNS();
            expect(seeds).toEqual([]);
        });
    });

    describe('loadSeedNodes', () => {
        it('should aggregate seeds from all sources and filter duplicates', async () => {
            const mockDnsRecord = [['upeerId=dns1;address=1.1.1.1;publicKey=pub1']];
            vi.mocked(dns.promises.resolveTxt).mockResolvedValue(mockDnsRecord);

            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([
                { upeerId: 'file1', address: '2.2.2.2', publicKey: 'pub2' },
                { upeerId: 'dns1', address: '1.1.1.1', publicKey: 'pub1' }
            ]));

            const seeds = await getInternals(bootstrapManager).loadSeedNodes();

            expect(seeds.length).toBe(2);
            const ids = seeds.map((seed) => seed.upeerId);
            expect(ids).toContain('dns1');
            expect(ids).toContain('file1');
        });

        it('should return 0 sources if both DNS and File fail and SEED_NODES is empty', async () => {
            vi.mocked(dns.promises.resolveTxt).mockRejectedValue(new Error('DNS Down'));
            vi.mocked(fs.existsSync).mockReturnValue(false);

            const seeds = await getInternals(bootstrapManager).loadSeedNodes();
            expect(seeds.length).toBe(0);
        });

        it('should return 0 file seeds if File fails', async () => {
            vi.mocked(dns.promises.resolveTxt).mockResolvedValue([]);
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('FS Error'); });

            const seedsOutput = await getInternals(bootstrapManager).loadSeedNodes();
            expect(seedsOutput.length).toBe(0);
            const seedsFile = await getInternals(bootstrapManager).loadSeedNodesFromFile();
            expect(seedsFile).toEqual([]);
        });

        it('should handle findFileSync returning empty on non-string path', async () => {
            const mgrNoPath = createBootstrapManager(mockRoutingTable as object as ConstructorParameters<typeof BootstrapManager>[0], mockSendMessage, undefined, undefined);
            const seeds = await getInternals(mgrNoPath).loadSeedNodesFromFile();
            expect(seeds).toEqual([]);
        });

        it('should return empty if file content is malformed', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue('not json');
            const seeds = await getInternals(bootstrapManager).loadSeedNodesFromFile();
            expect(seeds).toEqual([]);
        });

        it('should return empty if data is not an array', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ not: 'an array' }));
            const seeds = await getInternals(bootstrapManager).loadSeedNodesFromFile();
            expect(seeds).toEqual([]);
        });

        it('should parse valid seeds from file', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            const mockData = [
                { upeerId: 'fseed1', address: '1.2.3.4', publicKey: 'fpub1' },
                { upeerId: 'fseed2', address: '5.6.7.8' }
            ];
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockData));

            const seeds = await getInternals(bootstrapManager).loadSeedNodesFromFile();
            expect(seeds).toHaveLength(1);
            expect(seeds[0].upeerId).toBe('fseed1');
        });
    });

    describe('bootstrapFromContacts', () => {
        it('should return 0 if no getContacts function provided', () => {
            const mgr = createBootstrapManager(mockRoutingTable as object as ConstructorParameters<typeof BootstrapManager>[0], mockSendMessage);
            expect(mgr.bootstrapFromContacts()).toBe(0);
        });

        it('should add valid connected contacts to routing table', () => {
            const mockContacts = [
                { upeerId: '0123456789abcdef0123456789abcdef', publicKey: 'pub1', address: 'addr1', status: 'connected' },
                { upeerId: 'deadbeefdeadbeefdeadbeefdeadbeef', publicKey: 'pub2', address: 'addr2', status: 'pending' },
                { upeerId: 'badid', publicKey: '', address: '', status: 'connected' }
            ];
            const getContacts = () => mockContacts;
            const mgr = createBootstrapManager(mockRoutingTable as object as ConstructorParameters<typeof BootstrapManager>[0], mockSendMessage, getContacts);

            mockAddContact.mockReturnValue(true);
            const count = mgr.bootstrapFromContacts();

            expect(count).toBe(1);
            expect(mockAddContact).toHaveBeenCalledTimes(1);
        });

        it('should return 0 if no contacts are provided', () => {
            const getContacts = () => [];
            const mgr = createBootstrapManager(mockRoutingTable as object as ConstructorParameters<typeof BootstrapManager>[0], mockSendMessage, getContacts);
            expect(mgr.bootstrapFromContacts()).toBe(0);
        });
    });

    describe('attemptBootstrapFromSeeds', () => {
        it('should respect retry timeout', async () => {
            await bootstrapManager.attemptBootstrapFromSeeds();
            mockAddContact.mockClear();

            await bootstrapManager.attemptBootstrapFromSeeds();
            expect(mockAddContact).not.toHaveBeenCalled();
        });

        it('should load seeds and attempt to ping each', async () => {
            vi.mocked(dns.promises.resolveTxt).mockResolvedValue([['upeerId=dns1;address=1.1.1.1;publicKey=pub1']]);
            vi.mocked(fs.existsSync).mockReturnValue(false);

            await getInternals(bootstrapManager).attemptBootstrapFromSeeds();

            expect(mockAddContact).toHaveBeenCalled();
            expect(mockSendMessage).toHaveBeenCalledWith('1.1.1.1', expect.objectContaining({ type: 'DHT_PING' }));
        });

        it('should handle send failures gracefully', async () => {
            vi.mocked(dns.promises.resolveTxt).mockResolvedValue([['upeerId=dns1;address=1.1.1.1;publicKey=pub1']]);
            mockSendMessage.mockImplementation(() => { throw new Error('Send fail'); });

            await getInternals(bootstrapManager).attemptBootstrapFromSeeds();
            expect(mockAddContact).toHaveBeenCalled();
        });
    });

    describe('updateBootstrapStatus', () => {
        it('should update bootstrapped status correctly', () => {
            mockGetContactCount.mockReturnValue(1);
            bootstrapManager.updateBootstrapStatus();
            expect(bootstrapManager.isBootstrapped()).toBe(false);

            mockGetContactCount.mockReturnValue(10);
            bootstrapManager.updateBootstrapStatus();
            expect(bootstrapManager.isBootstrapped()).toBe(true);
        });

        it('should increment bootstrapSuccesses when gaining status', () => {
            mockGetContactCount.mockReturnValue(0);
            bootstrapManager.updateBootstrapStatus();
            const initialStats = bootstrapManager.getStats();

            mockGetContactCount.mockReturnValue(10);
            bootstrapManager.updateBootstrapStatus();
            expect(bootstrapManager.getStats().bootstrapSuccesses).toBe(initialStats.bootstrapSuccesses + 1);
        });
    });

    describe('retryBootstrap', () => {
        it('should bypass the timeout and retry', async () => {
            await bootstrapManager.attemptBootstrapFromSeeds();
            const attemptsBeforeRetry = bootstrapManager.getStats().bootstrapAttempts;

            await bootstrapManager.retryBootstrap();
            expect(bootstrapManager.getStats().bootstrapAttempts).toBe(attemptsBeforeRetry + 1);
        });
    });

    describe('helper methods', () => {
        it('should return contact count', () => {
            mockGetContactCount.mockReturnValue(5);
            bootstrapManager.updateBootstrapStatus();
            expect(bootstrapManager.getContactCount()).toBe(5);
        });

        it('should return time since last attempt', async () => {
            const now = Date.now();
            vi.setSystemTime(now);
            await bootstrapManager.attemptBootstrapFromSeeds();
            vi.setSystemTime(now + 1000);
            expect(bootstrapManager.getTimeSinceLastAttempt()).toBe(1000);
        });
    });
});
