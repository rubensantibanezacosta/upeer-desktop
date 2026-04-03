import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContacts: vi.fn(() => []),
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'self-id'),
    incrementMyDhtSeq: vi.fn(() => 21),
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    getDhtNetworkAddresses: vi.fn(() => []),
    generateSignedLocationBlock: vi.fn(() => ({ address: '200::self', addresses: ['200::self'], dhtSeq: 21, signature: 'sig-21' })),
    getDeviceMetadata: vi.fn(() => ({ clientName: 'EdgeTest' })),
    isYggdrasilAddress: vi.fn((addr: string) => addr.startsWith('200:') || addr.startsWith('300:')),
}));

vi.mock('../../../src/main_process/network/dht/handlers.js', () => ({
    getKademliaInstance: vi.fn(),
    publishLocationBlock: vi.fn(),
    findNodeLocation: vi.fn(),
    iterativeFindNode: vi.fn(),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    network: vi.fn(),
    warn: vi.fn(),
}));

describe('dhtExchange/broadcast edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('broadcastDhtUpdate deduplica direcciones y descarta conocidas inválidas', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const identity = await import('../../../src/main_process/security/identity.js');
        const utils = await import('../../../src/main_process/network/utils.js');
        const handlers = await import('../../../src/main_process/network/dht/handlers.js');
        const { broadcastDhtUpdate } = await import('../../../src/main_process/network/dht/core.js');

        const sendSecureUDPMessage = vi.fn();

        vi.mocked(utils.getDhtNetworkAddresses).mockReturnValue(['200::self', '200::backup']);
        vi.mocked(contactsOps.getContacts).mockReturnValue([
            {
                upeerId: 'peer-1',
                status: 'connected',
                address: '200::peer',
                knownAddresses: JSON.stringify(['200::peer', 'invalid-ip', '200::peer-2']),
            },
        ] as never);
        vi.mocked(handlers.publishLocationBlock).mockResolvedValue(undefined);

        broadcastDhtUpdate(sendSecureUDPMessage);

        expect(identity.incrementMyDhtSeq).toHaveBeenCalled();
        expect(handlers.publishLocationBlock).toHaveBeenCalled();
        expect(sendSecureUDPMessage).toHaveBeenCalledTimes(2);
        expect(sendSecureUDPMessage).toHaveBeenCalledWith('200::peer', expect.objectContaining({ type: 'DHT_UPDATE' }));
        expect(sendSecureUDPMessage).toHaveBeenCalledWith('200::peer-2', expect.objectContaining({ type: 'DHT_UPDATE' }));
    });

    it('sendDhtExchange filtra peers inválidos de Kademlia y usa fallback de address al parsear mal knownAddresses', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const handlers = await import('../../../src/main_process/network/dht/handlers.js');
        const { sendDhtExchange } = await import('../../../src/main_process/network/dht/core.js');

        const sendSecureUDPMessage = vi.fn();

        vi.mocked(handlers.getKademliaInstance).mockReturnValue({
            findClosestContacts: vi.fn(() => [
                { upeerId: 'target-peer', address: '200::target', publicKey: 'aa'.repeat(32), dhtSignature: 'sig-target', dhtSeq: 1, nodeId: Buffer.alloc(20), lastSeen: Date.now() },
                { upeerId: 'peer-valid', address: '200::valid', publicKey: 'bb'.repeat(32), dhtSignature: 'sig-valid', dhtSeq: 2, nodeId: Buffer.alloc(20), lastSeen: Date.now() },
                { upeerId: 'peer-no-sig', address: '200::nosig', publicKey: 'cc'.repeat(32), dhtSeq: 3, nodeId: Buffer.alloc(20), lastSeen: Date.now() },
            ]),
        } as never);
        vi.mocked(contactsOps.getContactByUpeerId).mockImplementation((upeerId: string) => {
            if (upeerId === 'target-peer') {
                return { upeerId, status: 'connected', address: '200::dest' } as never;
            }
            if (upeerId === 'peer-valid') {
                return {
                    upeerId,
                    status: 'connected',
                    address: '200::valid',
                    dhtExpiresAt: 999,
                    renewalToken: JSON.stringify({ token: 'tok-valid' }),
                    knownAddresses: 'not-json',
                } as never;
            }
            return undefined;
        });

        await sendDhtExchange('target-peer', sendSecureUDPMessage);

        expect(sendSecureUDPMessage).toHaveBeenCalledTimes(1);
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::dest',
            expect.objectContaining({
                type: 'DHT_EXCHANGE',
                peers: [
                    expect.objectContaining({
                        upeerId: 'peer-valid',
                        locationBlock: expect.objectContaining({
                            address: '200::valid',
                            addresses: ['200::valid'],
                            expiresAt: 999,
                            renewalToken: { token: 'tok-valid' },
                        }),
                    }),
                ],
            })
        );
    });
});
