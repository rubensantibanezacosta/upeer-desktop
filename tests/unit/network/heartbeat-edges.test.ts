import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyAlias: vi.fn(() => 'Me'),
    getMyAvatar: vi.fn(() => 'avatar-data'),
    getMyDhtSeq: vi.fn(() => 9),
    getMySignedPreKeyBundle: vi.fn(() => ({ spkPub: 'aa'.repeat(32), spkSig: 'bb'.repeat(64), spkId: 7 })),
    isSessionLocked: vi.fn(() => false),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContacts: vi.fn(() => []),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
    network: vi.fn(),
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    getDhtNetworkAddresses: vi.fn(() => []),
    generateSignedLocationBlock: vi.fn(() => ({ address: '200::self', addresses: ['200::self'], dhtSeq: 9, signature: 'sig' })),
    getDeviceMetadata: vi.fn(() => ({ clientName: 'Test' })),
    isYggdrasilAddress: vi.fn((addr: string) => addr.startsWith('200:') || addr.startsWith('300:')),
}));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/core.js', () => ({
    sendDhtExchange: vi.fn(),
    broadcastDhtUpdate: vi.fn(),
}));

vi.mock('../../../src/main_process/network/server/circuitBreaker.js', () => ({
    isIPBlocked: vi.fn(() => false),
}));

vi.mock('../../../src/main_process/network/messaging/contacts.js', () => ({
    sendContactRequest: vi.fn(),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    getGossipIds: vi.fn(() => {
        throw new Error('reputation-down');
    }),
}));

describe('heartbeat edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('omite IPs bloqueadas pero sigue latiendo por otras direcciones válidas', async () => {
        const heartbeat = await import('../../../src/main_process/network/messaging/heartbeat.js');
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const dhtCore = await import('../../../src/main_process/network/dht/core.js');
        const breaker = await import('../../../src/main_process/network/server/circuitBreaker.js');

        vi.mocked(contactsOps.getContacts).mockReturnValue([] as never);
        vi.mocked(breaker.isIPBlocked).mockImplementation((ip: string) => ip === '200::blocked');

        heartbeat.checkHeartbeat([
            {
                upeerId: 'peer-1',
                status: 'connected',
                publicKey: 'cc'.repeat(32),
                address: '200::blocked',
                knownAddresses: JSON.stringify(['200::ok', 'invalid-ip', '200::blocked']),
            },
        ]);

        await Promise.resolve();

        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(1);
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::ok',
            expect.objectContaining({ type: 'PING', alias: 'Me', avatar: 'avatar-data' }),
            'cc'.repeat(32)
        );
        expect(dhtCore.sendDhtExchange).toHaveBeenCalledWith('peer-1', transport.sendSecureUDPMessage);
    });

    it('tolera fallo en gossip de reputación y aún comparte estado DHT útil', async () => {
        const heartbeat = await import('../../../src/main_process/network/messaging/heartbeat.js');
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const netUtils = await import('../../../src/main_process/network/utils.js');
        const sendMock = transport.sendSecureUDPMessage as (ip: string, data: unknown, pubKey?: string, internal?: boolean) => void;

        vi.mocked(netUtils.getDhtNetworkAddresses).mockReturnValue(['200::self']);
        vi.mocked(contactsOps.getContacts).mockReturnValue([
            {
                upeerId: 'peer-seen',
                status: 'connected',
                address: '200::seen',
                publicKey: 'dd'.repeat(32),
                lastSeen: new Date().toISOString(),
            },
            {
                upeerId: 'peer-renew',
                status: 'connected',
                address: '200::renew',
                publicKey: 'ee'.repeat(32),
                dhtSignature: 'sig-renew',
                dhtSeq: 4,
                dhtExpiresAt: Date.now() + 1_000,
                renewalToken: JSON.stringify({ token: 'renew-me' }),
            },
        ] as never);

        await expect(heartbeat.distributedHeartbeat({
            upeerId: 'peer-target',
            status: 'connected',
            address: '200::target',
            knownAddresses: JSON.stringify(['200::target-2']),
            publicKey: 'ff'.repeat(32),
        }, sendMock)).resolves.toBeUndefined();

        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::target',
            expect.objectContaining({ type: 'DHT_UPDATE', locationBlock: expect.objectContaining({ dhtSeq: 9 }) }),
            'ff'.repeat(32)
        );
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::target',
            expect.objectContaining({
                type: 'DHT_EXCHANGE',
                peers: expect.arrayContaining([expect.objectContaining({ upeerId: 'peer-seen' })]),
            }),
            'ff'.repeat(32)
        );
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::target',
            expect.objectContaining({
                type: 'DHT_EXCHANGE',
                peers: expect.arrayContaining([expect.objectContaining({ upeerId: 'peer-renew' })]),
            }),
            'ff'.repeat(32)
        );
    });
});
