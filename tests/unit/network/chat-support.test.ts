import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/handlers.js', () => ({
    getKademliaInstance: vi.fn(),
}));

vi.mock('../../../src/main_process/sidecars/yggstack.js', () => ({
    getYggstackAddress: vi.fn(),
}));

describe('network/messaging/chatSupport.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('normaliza fanout, elimina duplicados y descarta direcciones vacías', async () => {
        const { getFanOutAddresses } = await import('../../../src/main_process/network/messaging/chatSupport.js');

        expect(getFanOutAddresses({
            upeerId: 'peer-1',
            address: ' 200::1 ',
            knownAddresses: JSON.stringify(['200::2', '200::1', ' ', '', ' 200::3 ']),
        })).toEqual(['200::1', '200::2', '200::3']);
    });

    it('tolera knownAddresses malformadas y mantiene la primaria válida', async () => {
        const { getFanOutAddresses } = await import('../../../src/main_process/network/messaging/chatSupport.js');

        expect(getFanOutAddresses({
            upeerId: 'peer-2',
            address: '200::9',
            knownAddresses: 'not-json',
        })).toEqual(['200::9']);
    });

    it('deduplica self addresses y excluye la dirección local actual', async () => {
        const dhtHandlers = await import('../../../src/main_process/network/dht/handlers.js');
        const yggstack = await import('../../../src/main_process/sidecars/yggstack.js');
        const { getSelfAddresses } = await import('../../../src/main_process/network/messaging/chatSupport.js');

        vi.mocked(yggstack.getYggstackAddress).mockReturnValue('200::self');
        vi.mocked(dhtHandlers.getKademliaInstance).mockReturnValue({
            findClosestContacts: vi.fn(() => [
                { upeerId: 'self-id', address: '200::self' },
                { upeerId: 'self-id', address: ' 200::tablet ' },
                { upeerId: 'self-id', address: '200::tablet' },
                { upeerId: 'self-id', address: ' ' },
                { upeerId: 'other-id', address: '200::other' },
            ]),
        } as unknown as ReturnType<typeof dhtHandlers.getKademliaInstance>);

        await expect(getSelfAddresses('self-id')).resolves.toEqual(['200::tablet']);
    });
});