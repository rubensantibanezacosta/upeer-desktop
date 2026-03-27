import { describe, it, expect, vi, beforeEach } from 'vitest';
import { broadcastDhtUpdate, sendDhtExchange, startDhtSearch, aggressiveRediscovery, startEnhancedBeaconMode } from '../../../src/main_process/network/dht/core';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations';
import * as identity from '../../../src/main_process/security/identity';
import * as utils from '../../../src/main_process/network/utils';
import * as handlers from '../../../src/main_process/network/dht/handlers';
import type { Contact } from '../../../src/types/chat.js';
import type { KademliaContact } from '../../../src/main_process/network/dht/kademlia/types.js';
import type { LocationBlock, RenewalToken } from '../../../src/main_process/network/types.js';

type NetworkContact = Contact & {
    dhtSignature?: string | null;
    dhtSeq?: number | null;
    dhtExpiresAt?: number | null;
    renewalToken?: string | null;
    expiresAt?: number | null;
    knownAddresses?: string[] | string;
};

type KademliaLookup = {
    findClosestContacts: (targetUpeerId: string, limit: number) => KademliaContact[];
};

function createContact(overrides: Partial<NetworkContact> & Pick<NetworkContact, 'upeerId' | 'status'>): NetworkContact {
    return {
        upeerId: overrides.upeerId,
        status: overrides.status,
        address: overrides.address ?? '',
        name: overrides.name ?? overrides.upeerId,
        ...overrides,
    };
}

function createKademliaContact(overrides: Partial<KademliaContact> & Pick<KademliaContact, 'upeerId' | 'address' | 'publicKey'>): KademliaContact {
    return {
        upeerId: overrides.upeerId,
        address: overrides.address,
        publicKey: overrides.publicKey,
        nodeId: overrides.nodeId ?? Buffer.from(overrides.upeerId.padEnd(40, '0').slice(0, 40), 'hex'),
        lastSeen: overrides.lastSeen ?? Date.now(),
        dhtSeq: overrides.dhtSeq,
        dhtSignature: overrides.dhtSignature,
    };
}

vi.mock('../../../src/main_process/storage/contacts/operations');
vi.mock('../../../src/main_process/security/identity');
vi.mock('../../../src/main_process/network/utils', () => ({
    getNetworkAddresses: vi.fn(),
    getDhtNetworkAddresses: vi.fn(),
    generateSignedLocationBlock: vi.fn(),
    getDeviceMetadata: vi.fn(),
    validateDhtSequence: vi.fn(),
    canonicalStringify: (obj: unknown) => JSON.stringify(obj),
    isYggdrasilAddress: (addr: string) => /^[23][0-9a-f]{2}:/i.test(addr)
}));
vi.mock('../../../src/main_process/network/dht/handlers');
vi.mock('../../../src/main_process/security/secure-logger');

describe('DHT Core', () => {
    const sendSecureUDPMessage = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(identity.getMyUPeerId).mockReturnValue('my-upeer-id');
        vi.mocked(utils.getDeviceMetadata).mockReturnValue({ clientName: 'Test' });
    });

    describe('broadcastDhtUpdate', () => {
        it('should not broadcast if no addresses found', () => {
            vi.mocked(utils.getDhtNetworkAddresses).mockReturnValue([]);
            broadcastDhtUpdate(sendSecureUDPMessage);
            expect(identity.incrementMyDhtSeq).not.toHaveBeenCalled();
        });

        it('should broadcast update when addresses change', () => {
            vi.mocked(utils.getDhtNetworkAddresses).mockReturnValue(['200:db8::1']);
            vi.mocked(identity.incrementMyDhtSeq).mockReturnValue(100);
            vi.mocked(utils.generateSignedLocationBlock).mockReturnValue({
                address: '200:db8::1',
                addresses: ['200:db8::1'],
                dhtSeq: 100,
                signature: 'sig',
                expiresAt: 12345
            } as LocationBlock);
            vi.mocked(contactsOps.getContacts).mockReturnValue([
                createContact({ upeerId: 'contact1', address: '200:db8::2', status: 'connected' })
            ]);
            vi.mocked(handlers.publishLocationBlock).mockResolvedValue(undefined);

            broadcastDhtUpdate(sendSecureUDPMessage);

            expect(identity.incrementMyDhtSeq).toHaveBeenCalled();
            expect(handlers.publishLocationBlock).toHaveBeenCalled();
            expect(sendSecureUDPMessage).toHaveBeenCalledWith('200:db8::2', expect.objectContaining({
                type: 'DHT_UPDATE'
            }));
        });
    });

    describe('sendDhtExchange', () => {
        it('should exchange peers via Kademlia when available', async () => {
            const kademliaMock: KademliaLookup = {
                findClosestContacts: vi.fn().mockReturnValue([
                    createKademliaContact({ upeerId: 'peer1', address: 'addr1', publicKey: 'pk1', dhtSeq: 1, dhtSignature: 'sig1' })
                ])
            };
            vi.mocked(handlers.getKademliaInstance).mockReturnValue(kademliaMock);
            vi.mocked(contactsOps.getContactByUpeerId).mockImplementation((id: string) => {
                if (id === 'target-id') return createContact({ upeerId: 'target-id', address: 'target-addr', status: 'connected' });
                if (id === 'peer1') return createContact({
                    upeerId: 'peer1',
                    status: 'connected',
                    address: 'addr1',
                    dhtExpiresAt: 999,
                    renewalToken: JSON.stringify({ token: 'tok1' }),
                    knownAddresses: JSON.stringify(['addr1'])
                });
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
            vi.mocked(contactsOps.getContactByUpeerId).mockReturnValue(createContact({ upeerId: 'target-id', address: 'target-addr', status: 'connected' }));
            vi.mocked(contactsOps.getContacts).mockReturnValue([
                createContact({
                    upeerId: 'peer1',
                    address: 'addr1',
                    status: 'connected',
                    dhtSignature: 'sig1',
                    dhtExpiresAt: 1000,
                    renewalToken: JSON.stringify({ token: 'tok1' })
                })
            ]);
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
            vi.mocked(contactsOps.getContactByUpeerId).mockReturnValue(createContact({ upeerId: 'target-id', address: 'target-addr', status: 'connected' }));

            const contacts: NetworkContact[] = Array.from({ length: 15 }, (_, i) => createContact({
                upeerId: `peer${i}`,
                address: `addr${i}`,
                status: 'connected',
                dhtSignature: 'sig'
            }));
            vi.mocked(contactsOps.getContacts).mockReturnValue(contacts);

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
            vi.mocked(handlers.getKademliaInstance).mockReturnValue({ findClosestContacts: vi.fn() } as KademliaLookup);
            vi.mocked(handlers.iterativeFindNode).mockResolvedValue(undefined);

            await startDhtSearch('target', sendSecureUDPMessage);
            expect(handlers.iterativeFindNode).toHaveBeenCalled();
        });

        it('should fallback to legacy DHT_QUERY with distance sorting', async () => {
            vi.mocked(handlers.findNodeLocation).mockResolvedValue(null);
            vi.mocked(handlers.getKademliaInstance).mockReturnValue(null);

            vi.mocked(contactsOps.getContacts).mockReturnValue([
                createContact({ upeerId: 'a', address: 'ip-a', status: 'connected', renewalToken: 'tok', expiresAt: 100 }),
                createContact({ upeerId: 'b', address: 'ip-b', status: 'connected', expiresAt: 100 })
            ]);

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

            vi.mocked(contactsOps.getContacts).mockReturnValue([
                createContact({ upeerId: 'peer1', address: 'addr1', lastSeen: Date.now() - 1000, status: 'connected' })
            ]);

            const promise = aggressiveRediscovery('my-id', sendSecureUDPMessage);

            await vi.advanceTimersByTimeAsync(5000);

            const result = await promise;
            expect(result).toBeNull();

            await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

            vi.useRealTimers();
        });
    });

    describe('startEnhancedBeaconMode', () => {
        it('should handle phases', async () => {
            vi.useFakeTimers();
            vi.mocked(contactsOps.getContacts).mockReturnValue([
                createContact({ upeerId: 'peer1', address: 'addr1', status: 'connected' })
            ]);

            startEnhancedBeaconMode(3600000, sendSecureUDPMessage);

            await vi.advanceTimersByTimeAsync(300001);
            expect(sendSecureUDPMessage).toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(3600000);
            vi.clearAllMocks();
            await vi.advanceTimersByTimeAsync(1800001);

            vi.useRealTimers();
        });
    });

    it('sendDhtExchange should handle invalid distance calculation gracefully', async () => {
        vi.mocked(handlers.getKademliaInstance).mockReturnValue(null);
        vi.mocked(contactsOps.getContactByUpeerId).mockReturnValue(createContact({ upeerId: 'target-id', address: 'target-addr', status: 'connected' }));
        vi.mocked(contactsOps.getContacts).mockReturnValue([
            createContact({ upeerId: 'INVALID_ID', address: 'addr1', status: 'connected', dhtSignature: 'sig1' })
        ]);
        await sendDhtExchange('target-id', sendSecureUDPMessage);
        expect(sendSecureUDPMessage).toHaveBeenCalled();
    });

    it('legacy search distance calculation fallback', async () => {
        vi.mocked(handlers.findNodeLocation).mockResolvedValue(null);
        vi.mocked(handlers.getKademliaInstance).mockReturnValue(null);
        vi.mocked(contactsOps.getContacts).mockReturnValue([
            createContact({ upeerId: 'INVALID', address: 'addr1', status: 'connected' })
        ]);
        await startDhtSearch('target', sendSecureUDPMessage);
        expect(sendSecureUDPMessage).toHaveBeenCalled();
    });
});