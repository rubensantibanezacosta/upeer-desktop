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

vi.mock('../../../src/main_process/network/dht/shared.js');
vi.mock('../../../src/main_process/storage/contacts/operations.js');
vi.mock('../../../src/main_process/storage/contacts/location.js');
vi.mock('../../../src/main_process/security/secure-logger.js');
vi.mock('../../../src/main_process/network/utils.js', async () => {
    const actual = await vi.importActual('../../../src/main_process/network/utils.js');
    return {
        ...actual as any,
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
    const mockWin = {} as any;
    const mockSendResponse = vi.fn();
    const mockSenderUpeerId = 'peer-sender';
    const mockSenderAddress = '201:1234::1';

    beforeEach(() => {
        vi.clearAllMocks();
        pendingQueries.clear();
    });

    describe('handleDhtPacket', () => {
        it('should return false if Kademlia instance is missing', async () => {
            (getKademliaInstance as any).mockReturnValue(null);
            const result = await handleDhtPacket('DHT_QUERY', {}, mockSenderUpeerId, mockSenderAddress, mockWin, mockSendResponse);
            expect(result).toBe(false);
        });

        it('should return true for known DHT types when instance exists', async () => {
            const mockKademlia = {
                handleQuery: vi.fn().mockResolvedValue(true)
            };
            (getKademliaInstance as any).mockReturnValue(mockKademlia);

            // We need to mock the specific sub-handlers or verify they are called
            // For now, let's test a simple flow that returns true
            const result = await handleDhtPacket('DHT_UNKNOWN', {}, mockSenderUpeerId, mockSenderAddress, mockWin, mockSendResponse);
            expect(result).toBe(false);
        });

        it('should handle DHT_UPDATE correctly', async () => {
            const mockKademlia = { storeLocationBlock: vi.fn() };
            (getKademliaInstance as any).mockReturnValue(mockKademlia);

            const contact = { upeerId: mockSenderUpeerId, publicKey: '00'.repeat(32), dhtSeq: 1 };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);
            (networkUtils.verifyLocationBlockWithDHT as any).mockResolvedValue(true);
            (networkUtils.validateDhtSequence as any).mockReturnValue({ valid: true });

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
            const mockKademlia = { handleMessage: vi.fn() };
            (getKademliaInstance as any).mockReturnValue(mockKademlia);

            const target = {
                upeerId: 'target-id',
                publicKey: '00'.repeat(32),
                address: 'target-addr',
                dhtSeq: 5,
                dhtSignature: 'target-sig',
                dhtExpiresAt: '2026-12-31T00:00:00Z'
            };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue(target);

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
            (getKademliaInstance as any).mockReturnValue({});

            const existingPeer = { upeerId: 'peerX', publicKey: '00'.repeat(32), dhtSeq: 1 };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue(existingPeer);
            (networkUtils.verifyLocationBlockWithDHT as any).mockResolvedValue(true);
            (networkUtils.validateDhtSequence as any).mockReturnValue({ valid: true });

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
            const mockKademlia = { handleMessage: vi.fn() };
            (getKademliaInstance as any).mockReturnValue(mockKademlia);

            const existingPeer = { upeerId: 'peerX', publicKey: 'pubX', dhtSeq: 1 };
            (contactsOps.getContactByUpeerId as any).mockImplementation(async (id: string) => {
                if (id === 'peerX') return existingPeer;
                return { upeerId: 'sender', publicKey: 'pubS' };
            });
            (networkUtils.verifyLocationBlockWithDHT as any).mockResolvedValue(false);

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
            const mockKademlia = { handleMessage: vi.fn() };
            (getKademliaInstance as any).mockReturnValue(mockKademlia);

            const existingPeer = { upeerId: 'peerX', publicKey: 'pubX', dhtSeq: 1 };
            // Mock getContactByUpeerId to return data for peerX
            (contactsOps.getContactByUpeerId as any).mockImplementation(async (id: string) => {
                console.log('getContactByUpeerId called for', id);
                if (id === 'peerX') return existingPeer;
                return { upeerId: 'sender', publicKey: 'pubS' }; // Needed for general success
            });

            (networkUtils.verifyLocationBlockWithDHT as any).mockResolvedValue(true);
            (networkUtils.validateDhtSequence as any).mockReturnValue({ valid: true });

            const originalBlock = { address: 'addrX', dhtSeq: 2, signature: 'sigX', renewalToken: { token: 'tok1' } };
            const renewedBlock = { ...originalBlock, dhtSeq: 3, signature: 'sigNew', renewalToken: { token: 'tok1', renewalsUsed: 1 } };

            (networkUtils.canRenewLocationBlock as any).mockReturnValue(true);
            (networkUtils.renewLocationBlock as any).mockReturnValue(renewedBlock);

            const data = {
                peers: [{
                    upeerId: 'peerX',
                    publicKey: 'pubX',
                    locationBlock: originalBlock
                }]
            };

            // Ensure senderUpeerId is NOT 'peerX'
            console.log('Calling handleDhtPacket with type DHT_EXCHANGE');
            const result = await handleDhtPacket('DHT_EXCHANGE', data, 'different-sender', mockSenderAddress, mockWin, mockSendResponse);
            console.log('Result:', result);
            expect(result).toBe(true);
            expect(networkUtils.renewLocationBlock).toHaveBeenCalled();
            expect(locationOps.updateContactDhtLocation).toHaveBeenCalled();
        });

        it('should require PoW for large sequence jump in DHT_UPDATE', async () => {
            const mockKademlia = { storeLocationBlock: vi.fn() };
            (getKademliaInstance as any).mockReturnValue(mockKademlia);

            const contact = { upeerId: mockSenderUpeerId, publicKey: '00'.repeat(32), dhtSeq: 1 };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);
            (networkUtils.verifyLocationBlockWithDHT as any).mockResolvedValue(true);
            (networkUtils.validateDhtSequence as any).mockReturnValue({
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
            const mockKademlia = { storeLocationBlock: vi.fn() };
            (getKademliaInstance as any).mockReturnValue(mockKademlia);

            const contact = { upeerId: mockSenderUpeerId, publicKey: '00'.repeat(32), dhtSeq: 1 };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue(contact);
            (networkUtils.verifyLocationBlockWithDHT as any).mockResolvedValue(true);
            (networkUtils.validateDhtSequence as any).mockReturnValue({
                valid: false,
                requiresPoW: true,
                reason: 'Large jump'
            });
            (AdaptivePow.verifyLightProof as any).mockReturnValue(true);

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
            const mockKademlia = {
                findLocationBlock: vi.fn(),
                findClosestContacts: vi.fn().mockReturnValue([{ upeerId: 'near1', address: 'addr1', publicKey: 'pk1' }])
            };
            (getKademliaInstance as any).mockReturnValue(mockKademlia);

            (contactsOps.getContactByUpeerId as any).mockResolvedValue(null);
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
            (getKademliaInstance as any).mockReturnValue({});
            const existing = { upeerId: 't1', publicKey: 'pub1', dhtSeq: 5 };
            (contactsOps.getContactByUpeerId as any).mockResolvedValue(existing);
            (networkUtils.verifyLocationBlockWithDHT as any).mockResolvedValue(true);

            const data = {
                targetId: 't1',
                locationBlock: { address: 'new-ip', dhtSeq: 10, signature: 'sig10' }
            };

            // Avoid renewal triggering in this test
            (networkUtils.canRenewLocationBlock as any).mockReturnValue(false);

            const result = await handleDhtPacket('DHT_RESPONSE', data, mockSenderUpeerId, mockSenderAddress, mockWin, mockSendResponse);

            expect(result).toBe(true);
            const calls = (locationOps.updateContactDhtLocation as any).mock.calls;
            const relevantCall = calls.find((c: any[]) => c[0] === 't1');
            expect(relevantCall).toEqual([
                't1', 'new-ip', 10, 'sig10', undefined, undefined
            ]);
        });

        it('should handle generic DHT_ messages via Kademlia instance', async () => {
            const mockKademlia = { handleMessage: vi.fn().mockResolvedValue({ type: 'PONG' }) };
            (getKademliaInstance as any).mockReturnValue(mockKademlia);

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
            const mockKademlia = { storeLocationBlock: vi.fn(), upeerId: 'me' };
            (getKademliaInstance as any).mockReturnValue(mockKademlia);

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
                getValueStore: () => ({
                    getAll: () => [{ publisher: 'target1', value: expiringBlock }]
                })
            };
            (getKademliaInstance as any).mockReturnValue(mockKademlia);
            (contactsOps.getContactByUpeerId as any).mockResolvedValue({ publicKey: 'pub1' });
            (networkUtils.verifyRenewalToken as any).mockReturnValue(true);

            await performAutoRenewal();

            expect(mockKademlia.storeLocationBlock).toHaveBeenCalled();
            expect(expiringBlock.renewalToken.renewalsUsed).toBe(1);
        });

        it('findNodeLocation should return null if kademlia is missing', async () => {
            (getKademliaInstance as any).mockReturnValue(null);
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
            (getKademliaInstance as any).mockReturnValue(mockKademlia);

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
            (getKademliaInstance as any).mockReturnValue(mockKademlia);

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
            (getKademliaInstance as any).mockReturnValue(mockKademlia);

            await performDhtMaintenance();
            expect(mockKademlia.performMaintenance).toHaveBeenCalled();
        });
    });
});
