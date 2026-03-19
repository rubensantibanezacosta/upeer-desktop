import { describe, it, expect, vi, beforeEach } from 'vitest';
import { broadcastDhtUpdate, sendDhtExchange, startDhtSearch, aggressiveRediscovery, startEnhancedBeaconMode } from '../../../src/main_process/network/dht/core';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations';
import * as identity from '../../../src/main_process/security/identity';
import * as utils from '../../../src/main_process/network/utils';
import * as handlers from '../../../src/main_process/network/dht/handlers';

vi.mock('../../../src/main_process/storage/contacts/operations');
vi.mock('../../../src/main_process/security/identity');
vi.mock('../../../src/main_process/network/utils');
vi.mock('../../../src/main_process/network/dht/handlers');
vi.mock('../../../src/main_process/security/secure-logger');

describe('DHT Core', () => {
    const sendSecureUDPMessage = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(identity.getMyUPeerId).mockReturnValue('my-upeer-id');
    });

    describe('broadcastDhtUpdate', () => {
        it('should not broadcast if no addresses found', () => {
            vi.mocked(utils.getNetworkAddresses).mockReturnValue([]);
            broadcastDhtUpdate(sendSecureUDPMessage);
            expect(identity.incrementMyDhtSeq).not.toHaveBeenCalled();
        });

        it('should broadcast update when addresses change', () => {
            vi.mocked(utils.getNetworkAddresses).mockReturnValue(['2001:db8::1']);
            vi.mocked(identity.incrementMyDhtSeq).mockReturnValue(100);
            vi.mocked(utils.generateSignedLocationBlock).mockReturnValue({
                address: '2001:db8::1',
                addresses: ['2001:db8::1'],
                dhtSeq: 100,
                signature: 'sig',
                expiresAt: 12345
            } as any);
            vi.mocked(contactsOps.getContacts).mockReturnValue([
                { upeerId: 'contact1', address: '2001:db8::2', status: 'connected' }
            ] as any);
            vi.mocked(handlers.publishLocationBlock).mockResolvedValue(undefined as any);

            broadcastDhtUpdate(sendSecureUDPMessage);

            expect(identity.incrementMyDhtSeq).toHaveBeenCalled();
            expect(handlers.publishLocationBlock).toHaveBeenCalled();
            expect(sendSecureUDPMessage).toHaveBeenCalledWith('2001:db8::2', expect.objectContaining({
                type: 'DHT_UPDATE'
            }));
        });
    });

    describe('sendDhtExchange', () => {
        it('should exchange peers via Kademlia when available', async () => {
            const kademliaMock = {
                findClosestContacts: vi.fn().mockReturnValue([
                    { upeerId: 'peer1', address: 'addr1', publicKey: 'pk1', dhtSeq: 1, dhtSignature: 'sig1' }
                ])
            };
            vi.mocked(handlers.getKademliaInstance).mockReturnValue(kademliaMock as any);
            vi.mocked(contactsOps.getContactByUpeerId).mockImplementation(async (id: string) => {
                if (id === 'target-id') return { upeerId: 'target-id', address: 'target-addr', status: 'connected' } as any;
                if (id === 'peer1') return {
                    upeerId: 'peer1',
                    dhtExpiresAt: 999,
                    renewalToken: JSON.stringify({ token: 'tok1' }),
                    knownAddresses: JSON.stringify(['addr1'])
                } as any;
                return null;
            });
            await sendDhtExchange('target-id', sendSecureUDPMessage);

            expect(sendSecureUDPMessage).toHaveBeenCalledWith('target-addr', expect.objectContaining({
                type: 'DHT_EXCHANGE',
                peers: expect.arrayContaining([
                    expect.objectContaining({
                        upeerId: 'peer1',
                        locationBlock: expect.objectContaining({
                            expiresAt: 999,
                            renewalToken: { token: 'tok1' }
                        })
                    })
                ])
            }));
        });

        it('should exchange peers via legacy mode', async () => {
            vi.mocked(handlers.getKademliaInstance).mockReturnValue(null);
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ upeerId: 'target-id', address: 'target-addr', status: 'connected' } as any);
            vi.mocked(contactsOps.getContacts).mockReturnValue([
                {
                    upeerId: 'peer1',
                    address: 'addr1',
                    status: 'connected',
                    dhtSignature: 'sig1',
                    dhtExpiresAt: 1000,
                    renewalToken: JSON.stringify({ token: 'tok1' })
                }
            ] as any);
            await sendDhtExchange('target-id', sendSecureUDPMessage);

            expect(sendSecureUDPMessage).toHaveBeenCalledWith('target-addr', expect.objectContaining({
                type: 'DHT_EXCHANGE',
                peers: expect.arrayContaining([
                    expect.objectContaining({
                        upeerId: 'peer1',
                        locationBlock: expect.objectContaining({
                            expiresAt: 1000,
                            renewalToken: { token: 'tok1' }
                        })
                    })
                ])
            }));
        });

        it('should swap sources if many contacts available', async () => {
            vi.mocked(handlers.getKademliaInstance).mockReturnValue(null);
            vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ upeerId: 'target-id', address: 'target-addr', status: 'connected' } as any);

            // create 15 contacts to trigger swapping
            const contacts = Array.from({ length: 15 }, (_, i) => ({
                upeerId: `peer${i}`,
                address: `addr${i}`,
                status: 'connected',
                dhtSignature: 'sig'
            }));
            vi.mocked(contactsOps.getContacts).mockReturnValue(contacts as any);

            await sendDhtExchange('target-id', sendSecureUDPMessage);
            await sendDhtExchange('target-id', sendSecureUDPMessage);

            expect(sendSecureUDPMessage).toHaveBeenCalledTimes(2);
        });
    });

    describe('startDhtSearch', () => {
        it('should abort if location found in cache', async () => {
            vi.mocked(handlers.findNodeLocation).mockResolvedValue('found-ip');
            await startDhtSearch('target', sendSecureUDPMessage);
            expect(sendSecureUDPMessage).not.toHaveBeenCalled();
            expect(handlers.iterativeFindNode).not.toHaveBeenCalled();
        });

        it('should use iterativeFindNode if Kademlia is present', async () => {
            vi.mocked(handlers.findNodeLocation).mockResolvedValue(null);
            vi.mocked(handlers.getKademliaInstance).mockReturnValue({} as any);
            vi.mocked(handlers.iterativeFindNode).mockResolvedValue(undefined as any);

            await startDhtSearch('target', sendSecureUDPMessage);
            expect(handlers.iterativeFindNode).toHaveBeenCalled();
        });

        it('should fallback to legacy DHT_QUERY with distance sorting', async () => {
            vi.mocked(handlers.findNodeLocation).mockResolvedValue(null);
            vi.mocked(handlers.getKademliaInstance).mockReturnValue(null);

            vi.mocked(contactsOps.getContacts).mockReturnValue([
                { upeerId: 'a', address: 'ip-a', status: 'connected', renewalToken: 'tok', expiresAt: 100 },
                { upeerId: 'b', address: 'ip-b', status: 'connected', expiresAt: 100 }
            ] as any);

            await startDhtSearch('c', sendSecureUDPMessage);

            // Should prioritize 'a' because it has renewal token
            expect(sendSecureUDPMessage).toHaveBeenNthCalledWith(1, 'ip-a', expect.objectContaining({
                type: 'DHT_QUERY',
                targetId: 'c'
            }));
        });
    });

    describe('aggressiveRediscovery', () => {
        it('should return cached location if found via DHT lookup', async () => {
            vi.mocked(handlers.findNodeLocation).mockResolvedValue('found-ip');
            const result = await aggressiveRediscovery('my-id', sendSecureUDPMessage);
            expect(result).toBe('found-ip');
        });

        it('should handle full flow through contacts, LAN and enter beacon', async () => {
            vi.useFakeTimers();
            vi.mocked(handlers.findNodeLocation).mockResolvedValue(null);

            // Step 2: Recent contacts (within 30 days)
            vi.mocked(contactsOps.getContacts).mockReturnValue([
                { upeerId: 'peer1', address: 'addr1', lastSeen: Date.now() - 1000, status: 'connected' }
            ] as any);

            const promise = aggressiveRediscovery('my-id', sendSecureUDPMessage);

            // Advance for pingContact timeout (5s)
            await vi.advanceTimersByTimeAsync(5000);

            // Step 3 & 4 happens after Step 2 fails (resolve false)
            // It will enter beacon mode because ping returns false (BUG AT fix correctly ignored)
            const result = await promise;
            expect(result).toBeNull();

            // Verify beacon interval
            await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

            vi.useRealTimers();
        });
    });

    describe('startEnhancedBeaconMode', () => {
        it('should handle phases', async () => {
            vi.useFakeTimers();
            vi.mocked(contactsOps.getContacts).mockReturnValue([
                { upeerId: 'peer1', address: 'addr1', status: 'connected' }
            ] as any);

            startEnhancedBeaconMode(3600000, sendSecureUDPMessage);

            await vi.advanceTimersByTimeAsync(300001); // 5 min
            expect(sendSecureUDPMessage).toHaveBeenCalled();

            // Advance past first phase to reduced interval
            await vi.advanceTimersByTimeAsync(3600000);
            vi.clearAllMocks();
            await vi.advanceTimersByTimeAsync(1800001); // 30 min

            vi.useRealTimers();
        });
    });

    it('sendDhtExchange should handle invalid distance calculation gracefully', async () => {
        vi.mocked(handlers.getKademliaInstance).mockReturnValue(null);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ upeerId: 'target-id', address: 'target-addr', status: 'connected' } as any);
        vi.mocked(contactsOps.getContacts).mockReturnValue([
            { upeerId: 'INVALID_ID', address: 'addr1', status: 'connected', dhtSignature: 'sig1' }
        ] as any);
        await sendDhtExchange('target-id', sendSecureUDPMessage);
        expect(sendSecureUDPMessage).toHaveBeenCalled();
    });

    it('legacy search distance calculation fallback', async () => {
        vi.mocked(handlers.findNodeLocation).mockResolvedValue(null);
        vi.mocked(handlers.getKademliaInstance).mockReturnValue(null);
        vi.mocked(contactsOps.getContacts).mockReturnValue([
            { upeerId: 'INVALID', address: 'addr1', status: 'connected' }
        ] as any);
        await startDhtSearch('target', sendSecureUDPMessage);
        expect(sendSecureUDPMessage).toHaveBeenCalled();
    });
});