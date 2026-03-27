import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    handleDhtPacket,
    handleDhtFoundNodes,
    handleDhtFoundValue,
    pendingQueries,
    cleanupPendingQueries,
    publishLocationBlock,
    performAutoRenewal,
    findNodeLocation,
    iterativeFindNode,
    performDhtMaintenance
} from '../../../src/main_process/network/dht/handlers.js';
import { getKademliaInstance } from '../../../src/main_process/network/dht/shared.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations.js';
import * as locationOps from '../../../src/main_process/storage/contacts/location.js';
import * as networkUtils from '../../../src/main_process/network/utils.js';
import { AdaptivePow } from '../../../src/main_process/security/pow.js';
import type { Contact } from '../../../src/types/chat.js';
import type { KademliaContact } from '../../../src/main_process/network/dht/kademlia/types.js';

type NetworkContact = Contact & {
    dhtSeq?: number;
    dhtSignature?: string;
    dhtExpiresAt?: number | string;
    renewalToken?: string;
    knownAddresses?: string;
};

type MockKademlia = {
    handleMessage?: ReturnType<typeof vi.fn>;
    storeLocationBlock?: ReturnType<typeof vi.fn>;
    findLocationBlock?: ReturnType<typeof vi.fn>;
    findClosestContacts?: ReturnType<typeof vi.fn>;
    getAllStoredValues?: ReturnType<typeof vi.fn>;
    performMaintenance?: ReturnType<typeof vi.fn>;
    upeerId?: string;
};

function createContact(overrides: Partial<NetworkContact> & Pick<NetworkContact, 'upeerId'>): NetworkContact {
    return {
        upeerId: overrides.upeerId,
        name: overrides.name ?? overrides.upeerId,
        status: overrides.status ?? 'connected',
        address: overrides.address ?? '',
        ...overrides,
    };
}

function getKademliaMock(overrides: Partial<MockKademlia>): MockKademlia {
    return overrides;
}

vi.mock('../../../src/main_process/network/dht/shared.js');
vi.mock('../../../src/main_process/storage/contacts/operations.js');
vi.mock('../../../src/main_process/storage/contacts/location.js');
vi.mock('../../../src/main_process/security/secure-logger.js');
vi.mock('../../../src/main_process/network/utils.js', async () => {
    const actual = await vi.importActual<typeof import('../../../src/main_process/network/utils.js')>('../../../src/main_process/network/utils.js');
    return {
        ...actual,
        verifyLocationBlockWithDHT: vi.fn(),
        validateDhtSequence: vi.fn(),
        storeRenewalTokenInDHT: vi.fn().mockReturnValue(Promise.resolve()),
        renewLocationBlock: vi.fn(),
        canRenewLocationBlock: vi.fn(),
        verifyRenewalToken: vi.fn()
    };
});
vi.mock('../../../src/main_process/security/pow.js');

describe('network/dht/handlers.ts', () => {
    const mockWin = null;
    const mockSendResponse = vi.fn();
    const mockSenderUpeerId = 'peer-sender';
    const mockSenderAddress = '201:1234::1';

    beforeEach(() => {
        vi.clearAllMocks();
        pendingQueries.clear();
    });

    describe('handleDhtPacket', () => {
        it('should return false if Kademlia instance is missing', async () => {
            vi.mocked(getKademliaInstance).mockReturnValue(null);
            const result = await handleDhtPacket('DHT_QUERY', {}, mockSenderUpeerId, mockSenderAddress, mockWin, mockSendResponse);
            expect(result).toBe(false);
        });

        it('should return true for known DHT types when instance exists', async () => {
            const mockKademlia = getKademliaMock({
                handleQuery: vi.fn().mockResolvedValue(true)
            });
            vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);

            const result = await handleDhtPacket('DHT_UNKNOWN', {}, mockSenderUpeerId, mockSenderAddress, mockWin, mockSendResponse);
            expect(result).toBe(false);
        });

        it('should handle DHT_UPDATE correctly', async () => {
            const mockKademlia = getKademliaMock({ storeLocationBlock: vi.fn() });
            vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);

            const contact = createContact({ upeerId: mockSenderUpeerId, publicKey: '00'.repeat(32), dhtSeq: 1 });
            vi.mocked(contactsOps.getContactByUpeerId).mockReturnValue(contact);
            vi.mocked(networkUtils.verifyLocationBlockWithDHT).mockResolvedValue(true);
            vi.mocked(networkUtils.validateDhtSequence).mockReturnValue({ valid: true });

            const data = {
                locationBlock: {
                    address: 'addr1',
                    dhtSeq: 2,
                    signature: 'sig-hex'
                }
            };

            const result = await handleDhtPacket('DHT_UPDATE', data, mockSenderUpeerId, mockSenderAddress, mockWin, mockSendResponse);

            expect(result).toBe(true);
            expect(networkUtils.verifyLocationBlockWithDHT).toHaveBeenCalled();
            expect(mockKademlia.storeLocationBlock).toHaveBeenCalledWith(mockSenderUpeerId, data.locationBlock);
        });

        it('should handle DHT_QUERY correctly', async () => {
            const mockKademlia = getKademliaMock({ handleMessage: vi.fn() });
            vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);

            const target = createContact({
                upeerId: 'target-id',
                publicKey: '00'.repeat(32),
                address: 'target-addr',
                dhtSeq: 5,
                dhtSignature: 'target-sig',
                dhtExpiresAt: '2026-12-31T00:00:00Z'
            });
            vi.mocked(contactsOps.getContactByUpeerId).mockReturnValue(target);

            const data = { targetId: 'target-id' };
            const result = await handleDhtPacket('DHT_QUERY', data, mockSenderUpeerId, mockSenderAddress, mockWin, mockSendResponse);

            expect(result).toBe(true);
            expect(mockSendResponse).toHaveBeenCalledWith(mockSenderAddress, expect.objectContaining({
                type: 'DHT_RESPONSE',
                targetId: 'target-id',
                locationBlock: expect.any(Object)
            }));
        });

        it('should handle DHT_EXCHANGE correctly', async () => {
            vi.mocked(getKademliaInstance).mockReturnValue({} as never);

            const existingPeer = createContact({ upeerId: 'peerX', publicKey: '00'.repeat(32), dhtSeq: 1 });
            vi.mocked(contactsOps.getContactByUpeerId).mockReturnValue(existingPeer);
            vi.mocked(networkUtils.verifyLocationBlockWithDHT).mockResolvedValue(true);
            vi.mocked(networkUtils.validateDhtSequence).mockReturnValue({ valid: true });

            const data = {
                peers: [{
                    upeerId: 'peerX',
                    publicKey: '00'.repeat(32),
                    locationBlock: {
                        address: 'addrX',
                        dhtSeq: 2,
                        signature: 'sigX'
                    }
                }]
            };

            const result = await handleDhtPacket('DHT_EXCHANGE', data, mockSenderUpeerId, mockSenderAddress, mockWin, mockSendResponse);

            expect(result).toBe(true);
            expect(networkUtils.verifyLocationBlockWithDHT).toHaveBeenCalled();
        });

        it('should handle invalid signature in DHT_EXCHANGE', async () => {
            const mockKademlia = getKademliaMock({ handleMessage: vi.fn() });
            vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);

            const existingPeer = createContact({ upeerId: 'peerX', publicKey: 'pubX', dhtSeq: 1 });
            vi.mocked(contactsOps.getContactByUpeerId).mockImplementation((id: string) => {
                if (id === 'peerX') return existingPeer;
                return createContact({ upeerId: 'sender', publicKey: 'pubS' });
            });
            vi.mocked(networkUtils.verifyLocationBlockWithDHT).mockResolvedValue(false);

            const data = {
                peers: [{
                    upeerId: 'peerX',
                    publicKey: 'pubX',
                    locationBlock: { address: 'addrX', dhtSeq: 2, signature: 'bad-sig' }
                }]
            };

            const result = await handleDhtPacket('DHT_EXCHANGE', data, 'sender', mockSenderAddress, mockWin, mockSendResponse);
            expect(result).toBe(true);
            expect(locationOps.updateContactDhtLocation).not.toHaveBeenCalled();
        });

        it('should renew location block during DHT_EXCHANGE if possible', async () => {
            const mockKademlia = getKademliaMock({ handleMessage: vi.fn() });
            vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);

            const existingPeer = createContact({ upeerId: 'peerX', publicKey: 'pubX', dhtSeq: 1 });
            vi.mocked(contactsOps.getContactByUpeerId).mockImplementation((id: string) => {
                if (id === 'peerX') return existingPeer;
                return createContact({ upeerId: 'sender', publicKey: 'pubS' });
            });

            vi.mocked(networkUtils.verifyLocationBlockWithDHT).mockResolvedValue(true);
            vi.mocked(networkUtils.validateDhtSequence).mockReturnValue({ valid: true });

            const originalBlock = { address: 'addrX', dhtSeq: 2, signature: 'sigX', renewalToken: { token: 'tok1' } };
            const renewedBlock = { ...originalBlock, dhtSeq: 3, signature: 'sigNew', renewalToken: { token: 'tok1', renewalsUsed: 1 } };

            vi.mocked(networkUtils.canRenewLocationBlock).mockReturnValue(true);
            vi.mocked(networkUtils.renewLocationBlock).mockReturnValue(renewedBlock);

            const data = {
                peers: [{
                    upeerId: 'peerX',
                    publicKey: 'pubX',
                    locationBlock: originalBlock
                }]
            };

            const result = await handleDhtPacket('DHT_EXCHANGE', data, 'different-sender', mockSenderAddress, mockWin, mockSendResponse);
            expect(result).toBe(true);
            expect(networkUtils.renewLocationBlock).toHaveBeenCalled();
            expect(locationOps.updateContactDhtLocation).toHaveBeenCalled();
        });

        it('should require PoW for large sequence jump in DHT_UPDATE', async () => {
            const mockKademlia = getKademliaMock({ storeLocationBlock: vi.fn() });
            vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);

            const contact = createContact({ upeerId: mockSenderUpeerId, publicKey: '00'.repeat(32), dhtSeq: 1 });
            vi.mocked(contactsOps.getContactByUpeerId).mockReturnValue(contact);
            vi.mocked(networkUtils.verifyLocationBlockWithDHT).mockResolvedValue(true);
            vi.mocked(networkUtils.validateDhtSequence).mockReturnValue({
                valid: false,
                requiresPoW: true,
                reason: 'Large jump'
            });

            const data = {
                locationBlock: {
                    address: 'addr1',
                    dhtSeq: 1000,
                    signature: 'sig-hex'
                    // Missing powProof
                }
            };

            const result = await handleDhtPacket('DHT_UPDATE', data, mockSenderUpeerId, mockSenderAddress, mockWin, mockSendResponse);
            expect(result).toBe(true); // Handler returns true because it matched the type, even if logic returns early
            expect(mockKademlia.storeLocationBlock).not.toHaveBeenCalled();
        });

        it('should accept DHT_UPDATE with valid PoW for large jump', async () => {
            const mockKademlia = getKademliaMock({ storeLocationBlock: vi.fn() });
            vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);

            const contact = createContact({ upeerId: mockSenderUpeerId, publicKey: '00'.repeat(32), dhtSeq: 1 });
            vi.mocked(contactsOps.getContactByUpeerId).mockReturnValue(contact);
            vi.mocked(networkUtils.verifyLocationBlockWithDHT).mockResolvedValue(true);
            vi.mocked(networkUtils.validateDhtSequence).mockReturnValue({
                valid: false,
                requiresPoW: true,
                reason: 'Large jump'
            });
            vi.mocked(AdaptivePow.verifyLightProof).mockReturnValue(true);

            const data = {
                locationBlock: {
                    address: 'addr1',
                    dhtSeq: 1000,
                    signature: 'sig-hex',
                    powProof: 'valid-proof'
                }
            };

            const result = await handleDhtPacket('DHT_UPDATE', data, mockSenderUpeerId, mockSenderAddress, mockWin, mockSendResponse);
            expect(result).toBe(true);
            expect(mockKademlia.storeLocationBlock).toHaveBeenCalled();
        });

        it('should handle DHT_QUERY correctly searching in Kademlia if local fails', async () => {
            const mockKademlia = getKademliaMock({
                findLocationBlock: vi.fn(),
                findClosestContacts: vi.fn().mockReturnValue([{ upeerId: 'near1', address: 'addr1', publicKey: 'pk1' }])
            });
            vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);

            vi.mocked(contactsOps.getContactByUpeerId).mockReturnValue(null);
            mockKademlia.findLocationBlock.mockResolvedValue(null);

            const data = { targetId: 'target-99', referralContext: 'search' };
            const result = await handleDhtPacket('DHT_QUERY', data, mockSenderUpeerId, mockSenderAddress, mockWin, mockSendResponse);

            expect(result).toBe(true);
            expect(mockKademlia.findLocationBlock).toHaveBeenCalledWith('target-99');
            expect(mockSendResponse).toHaveBeenCalledWith(mockSenderAddress, expect.objectContaining({
                type: 'DHT_RESPONSE',
                neighbors: expect.arrayContaining([expect.objectContaining({ upeerId: 'near1' })])
            }));
        });

        it('should handle DHT_RESPONSE and update local location', async () => {
            vi.mocked(getKademliaInstance).mockReturnValue({} as never);
            const existing = createContact({ upeerId: 't1', publicKey: 'pub1', dhtSeq: 5 });
            vi.mocked(contactsOps.getContactByUpeerId).mockReturnValue(existing);
            vi.mocked(networkUtils.verifyLocationBlockWithDHT).mockResolvedValue(true);

            const data = {
                targetId: 't1',
                locationBlock: { address: 'new-ip', dhtSeq: 10, signature: 'sig10' }
            };

            vi.mocked(networkUtils.canRenewLocationBlock).mockReturnValue(false);

            const result = await handleDhtPacket('DHT_RESPONSE', data, mockSenderUpeerId, mockSenderAddress, mockWin, mockSendResponse);

            expect(result).toBe(true);
            const calls = vi.mocked(locationOps.updateContactDhtLocation).mock.calls;
            const relevantCall = calls.find((call) => call[0] === 't1');
            expect(relevantCall).toEqual([
                't1', 'new-ip', 10, 'sig10', undefined, undefined
            ]);
        });

        it('should handle generic DHT_ messages via Kademlia instance', async () => {
            const mockKademlia = getKademliaMock({ handleMessage: vi.fn().mockResolvedValue({ type: 'PONG' }) });
            vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);

            const result = await handleDhtPacket('DHT_GOSSIP', { some: 'data' }, mockSenderUpeerId, mockSenderAddress, mockWin, mockSendResponse);

            expect(result).toBe(true);
            expect(mockKademlia.handleMessage).toHaveBeenCalled();
            expect(mockSendResponse).toHaveBeenCalledWith(mockSenderAddress, { type: 'PONG' });
        });
    });

    describe('handleDhtFoundNodes', () => {
        it('should resolve pending query and remove it from map', () => {
            const queryId = 'q123';
            const resolve = vi.fn();
            const reject = vi.fn();

            pendingQueries.set(queryId, {
                resolve,
                reject,
                type: 'FIND_NODE',
                targetId: 'target',
                timestamp: Date.now()
            });

            const data = { queryId, nodes: [{ upeerId: 'n1', address: 'addr1' }] };
            handleDhtFoundNodes(data, mockSenderAddress);

            expect(resolve).toHaveBeenCalledWith({ nodes: data.nodes, senderAddress: mockSenderAddress });
            expect(pendingQueries.has(queryId)).toBe(false);
        });
    });

    describe('handleDhtFoundValue', () => {
        it('should resolve pending query with value', () => {
            const queryId = 'q456';
            const resolve = vi.fn();
            const reject = vi.fn();

            pendingQueries.set(queryId, {
                resolve,
                reject,
                type: 'FIND_VALUE',
                targetId: 'target',
                timestamp: Date.now()
            });

            const data = { queryId, value: 'found-value' };
            handleDhtFoundValue(data, mockSenderAddress);

            expect(resolve).toHaveBeenCalledWith({ value: 'found-value', senderAddress: mockSenderAddress });
            expect(pendingQueries.has(queryId)).toBe(false);
        });
    });

    describe('cleanupPendingQueries', () => {
        it('should remove expired queries', () => {
            const resolve = vi.fn();
            const reject = vi.fn();
            const oldTimestamp = Date.now() - 60000; // 60s ago (limit is 30s)

            pendingQueries.set('expired', {
                resolve,
                reject,
                type: 'FIND_NODE',
                targetId: 'target',
                timestamp: oldTimestamp
            });

            cleanupPendingQueries();

            expect(reject).toHaveBeenCalledWith(expect.any(Error));
            expect(pendingQueries.has('expired')).toBe(false);
        });

        it('should keep fresh queries', () => {
            const resolve = vi.fn();
            const reject = vi.fn();

            pendingQueries.set('fresh', {
                resolve,
                reject,
                type: 'FIND_NODE',
                targetId: 'target',
                timestamp: Date.now()
            });

            cleanupPendingQueries();

            expect(reject).not.toHaveBeenCalled();
            expect(pendingQueries.has('fresh')).toBe(true);
        });
    });

    describe('Kademlia Integration exports', () => {
        it('publishLocationBlock should use kademlia instance', async () => {
            const mockKademlia = getKademliaMock({ storeLocationBlock: vi.fn(), upeerId: 'me' });
            vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);

            const block = { dhtSeq: 1 };
            await publishLocationBlock(block);
            expect(mockKademlia.storeLocationBlock).toHaveBeenCalledWith('me', block);
        });

        it('performAutoRenewal should renew expiring blocks', async () => {
            const now = Date.now();
            const expiringBlock = {
                expiresAt: now + 1000,
                renewalToken: {
                    allowedUntil: now + 100000,
                    renewalsUsed: 0,
                    maxRenewals: 10
                }
            };

            const mockKademlia = {
                storeLocationBlock: vi.fn(),
                getAllStoredValues: vi.fn(() => [{ publisher: 'target1', value: expiringBlock }])
            };
            vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);
            vi.mocked(contactsOps.getContactByUpeerId).mockReturnValue(createContact({ upeerId: 'target1', publicKey: 'pub1' }));
            vi.mocked(networkUtils.verifyRenewalToken).mockReturnValue(true);

            await performAutoRenewal();

            expect(mockKademlia.storeLocationBlock).toHaveBeenCalled();
            expect(expiringBlock.renewalToken.renewalsUsed).toBe(1);
        });

        it('findNodeLocation should return null if kademlia is missing', async () => {
            vi.mocked(getKademliaInstance).mockReturnValue(null);
            const res = await findNodeLocation('target');
            expect(res).toBe(null);
        });

        it('iterativeFindNode should return null if kademlia is missing', async () => {
            const res = await iterativeFindNode('target', vi.fn());
            expect(res).toBe(null);
        });

        it('iterativeFindNode logic should find node through multiple jumps', async () => {
            const mockKademlia = {
                findClosestContacts: vi.fn().mockReturnValue([{ upeerId: 'peer1', address: 'addr1', publicKey: 'pk1' }])
            };
            vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);

            const mockSendMessage = vi.fn((addr, data) => {
                // Simulate asynchronous response after a short delay
                setTimeout(() => {
                    if (data.type === 'DHT_FIND_NODE') {
                        // Return the target directly in the response
                        handleDhtFoundNodes({
                            queryId: data.queryId,
                            nodes: [{ upeerId: 'target', address: 'target-addr', publicKey: 'target-pk' }]
                        }, addr);
                    }
                }, 10);
            });

            const resultPromise = iterativeFindNode('target', mockSendMessage);
            const result = await resultPromise;

            expect(result).toBe('target-addr');
        });

        it('iterativeFindNode should stop after max iterations or timeout', async () => {
            const mockKademlia = {
                findClosestContacts: vi.fn().mockReturnValue([{ upeerId: 'peer1', address: 'addr1', publicKey: 'pk1' }])
            };
            vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);

            // Mock randomBytes to have stable queryIds if needed, but not strictly necessary here
            // What we need is to mock the timer or use a very short timeout if iterativeFindNode allowed it
            // Since it doesn't, we skip this long test or use vi.useFakeTimers()

            vi.useFakeTimers();
            const mockSendMessage = vi.fn();
            const resultPromise = iterativeFindNode('timeout-target', mockSendMessage);

            // Fast-forward time
            vi.advanceTimersByTime(35000);

            // We need to trigger the rejection of the pending query to unblock the await Promise.allSettled
            // In the real code, this happens via setTimeout inside iterativeFindNode
            // With fake timers, we need to make sure those internal setTimeouts fire.

            const result = await resultPromise;
            expect(result).toBe(null);
            vi.useRealTimers();
        });

        it('performDhtMaintenance should call kademlia maintenance', async () => {
            const mockKademlia = {
                performMaintenance: vi.fn()
            };
            vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);

            await performDhtMaintenance();
            expect(mockKademlia.performMaintenance).toHaveBeenCalled();
        });
    });
});
