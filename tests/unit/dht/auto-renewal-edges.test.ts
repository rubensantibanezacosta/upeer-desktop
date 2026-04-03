import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/network/dht/shared.js', () => ({
    getKademliaInstance: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/location.js', () => ({
    updateContactDhtLocation: vi.fn(),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    network: vi.fn(),
    security: vi.fn(),
    error: vi.fn(),
}));

vi.mock('../../../src/main_process/network/utils.js', async () => {
    const actual = await vi.importActual<typeof import('../../../src/main_process/network/utils.js')>('../../../src/main_process/network/utils.js');
    return {
        ...actual,
        verifyRenewalToken: vi.fn(),
    };
});

describe('DHT auto-renewal edges', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rechaza renovar bloques con token inválido', async () => {
        const { performAutoRenewal } = await import('../../../src/main_process/network/dht/handlers.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/shared.js');
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const utils = await import('../../../src/main_process/network/utils.js');

        const now = Date.now();
        const expiringBlock = {
            address: '200::1',
            dhtSeq: 4,
            signature: 'sig-1',
            expiresAt: now + 1_000,
            renewalToken: {
                allowedUntil: now + 10_000,
                renewalsUsed: 0,
                maxRenewals: 2,
            },
        };
        const mockKademlia = {
            storeLocationBlock: vi.fn(),
            getAllStoredValues: vi.fn(() => [{ publisher: 'peer-a', value: expiringBlock }]),
        };

        vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ upeerId: 'peer-a', publicKey: 'aa'.repeat(32) } as never);
        vi.mocked(utils.verifyRenewalToken).mockReturnValue(false);

        await performAutoRenewal();

        expect(mockKademlia.storeLocationBlock).not.toHaveBeenCalled();
    });

    it('no renueva si el token ya agotó sus renovaciones', async () => {
        const { performAutoRenewal } = await import('../../../src/main_process/network/dht/handlers.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/shared.js');
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const utils = await import('../../../src/main_process/network/utils.js');

        const now = Date.now();
        const expiringBlock = {
            address: '200::2',
            dhtSeq: 8,
            signature: 'sig-2',
            expiresAt: now + 1_000,
            renewalToken: {
                allowedUntil: now + 10_000,
                renewalsUsed: 2,
                maxRenewals: 2,
            },
        };
        const mockKademlia = {
            storeLocationBlock: vi.fn(),
            getAllStoredValues: vi.fn(() => [{ publisher: 'peer-b', value: expiringBlock }]),
        };

        vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ upeerId: 'peer-b', publicKey: 'bb'.repeat(32) } as never);
        vi.mocked(utils.verifyRenewalToken).mockReturnValue(true);

        await performAutoRenewal();

        expect(mockKademlia.storeLocationBlock).not.toHaveBeenCalled();
        expect(utils.verifyRenewalToken).not.toHaveBeenCalled();
    });

    it('actualiza la caché local al renovar correctamente un bloque con addresses', async () => {
        const { performAutoRenewal } = await import('../../../src/main_process/network/dht/handlers.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/shared.js');
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const locationOps = await import('../../../src/main_process/storage/contacts/location.js');
        const utils = await import('../../../src/main_process/network/utils.js');

        const now = Date.now();
        const expiringBlock = {
            address: '200::3',
            addresses: ['200::3', '200::4'],
            dhtSeq: 12,
            signature: 'sig-3',
            expiresAt: now + 1_000,
            renewalToken: {
                allowedUntil: now + 10_000,
                renewalsUsed: 0,
                maxRenewals: 3,
            },
        };
        const mockKademlia = {
            storeLocationBlock: vi.fn(),
            getAllStoredValues: vi.fn(() => [{ publisher: 'peer-c', value: expiringBlock }]),
        };

        vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as never);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ upeerId: 'peer-c', publicKey: 'cc'.repeat(32) } as never);
        vi.mocked(utils.verifyRenewalToken).mockReturnValue(true);

        await performAutoRenewal();

        expect(mockKademlia.storeLocationBlock).toHaveBeenCalledTimes(1);
        expect(locationOps.updateContactDhtLocation).toHaveBeenCalledWith(
            'peer-c',
            ['200::3', '200::4'],
            12,
            'sig-3',
            expect.any(Number),
            expiringBlock.renewalToken,
        );
    });
});
