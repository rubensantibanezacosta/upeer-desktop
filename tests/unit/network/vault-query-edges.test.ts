import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContacts: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'self-id'),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/shared.js', () => ({
    getKademliaInstance: vi.fn(),
}));

describe('VaultManager.queryOwnVaults edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('consulta custodios DHT válidos y amigos online sin duplicar self', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const dhtShared = await import('../../../src/main_process/network/dht/shared.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');

        vi.mocked(contactsOps.getContacts).mockResolvedValue([
            { upeerId: 'self-id', address: '200::self', status: 'connected' },
            { upeerId: 'friend-online', address: '200::friend', status: 'connected' },
            { upeerId: 'friend-offline', address: '200::offline', status: 'disconnected' },
        ] as never);

        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue({
            findValue: vi.fn().mockResolvedValue({ value: { custodians: ['self-id', 'custodian-ok', 'custodian-missing', 'custodian-throws'] } }),
            findLocationBlock: vi.fn(async (custodianId: string) => {
                if (custodianId === 'custodian-ok') return { address: '200::custodian' };
                if (custodianId === 'custodian-throws') throw new Error('lookup-failed');
                return null;
            }),
        } as never);

        await VaultManager.queryOwnVaults();

        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(2);
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::custodian',
            expect.objectContaining({ type: 'VAULT_QUERY', requesterSid: 'self-id' })
        );
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::friend',
            expect.objectContaining({ type: 'VAULT_QUERY', requesterSid: 'self-id' })
        );
    });

    it('si falla la búsqueda DHT, sigue consultando a amigos online', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const dhtShared = await import('../../../src/main_process/network/dht/shared.js');
        const logger = await import('../../../src/main_process/security/secure-logger.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');

        vi.mocked(contactsOps.getContacts).mockResolvedValue([
            { upeerId: 'friend-a', address: '200::a', status: 'connected' },
            { upeerId: 'friend-b', address: '200::b', status: 'connected' },
        ] as never);

        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue({
            findValue: vi.fn().mockRejectedValue(new Error('dht-down')),
            findLocationBlock: vi.fn(),
        } as never);

        await VaultManager.queryOwnVaults();

        expect(logger.warn).toHaveBeenCalledWith('Failed to find self-vault pointers in DHT', expect.any(Error), 'vault');
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(2);
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith('200::a', expect.objectContaining({ type: 'VAULT_QUERY' }));
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith('200::b', expect.objectContaining({ type: 'VAULT_QUERY' }));
    });

    it('si falla el transporte, registra warning y continúa con el resto de consultas', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const dhtShared = await import('../../../src/main_process/network/dht/shared.js');
        const logger = await import('../../../src/main_process/security/secure-logger.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');

        vi.mocked(contactsOps.getContacts).mockResolvedValue([
            { upeerId: 'friend-ok', address: '200::ok', status: 'connected' },
            { upeerId: 'friend-fails', address: '200::fail-friend', status: 'connected' },
        ] as never);

        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue({
            findValue: vi.fn().mockResolvedValue({ value: { custodians: ['custodian-fails'] } }),
            findLocationBlock: vi.fn().mockResolvedValue({ address: '200::fail-custodian' }),
        } as never);

        vi.mocked(transport.sendSecureUDPMessage).mockImplementation(async (address: string) => {
            if (address === '200::fail-custodian' || address === '200::fail-friend') {
                throw new Error(`send failed ${address}`);
            }
        });

        await expect(VaultManager.queryOwnVaults()).resolves.toBeUndefined();

        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(3);
        expect(logger.warn).toHaveBeenCalledWith(
            'Failed to send VAULT_QUERY to custodian custodian-fails',
            expect.any(Error),
            'vault'
        );
        expect(logger.warn).toHaveBeenCalledWith(
            'Failed to send VAULT_QUERY to online friend friend-fails',
            expect.any(Error),
            'vault'
        );
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::ok',
            expect.objectContaining({ type: 'VAULT_QUERY', requesterSid: 'self-id' })
        );
    });
});
