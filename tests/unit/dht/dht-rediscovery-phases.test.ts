import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContacts: vi.fn(() => []),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'self-id'),
    getMyPublicKeyHex: vi.fn(() => '11'.repeat(32)),
}));

vi.mock('../../../src/main_process/network/dht/handlers.js', () => ({
    findNodeLocation: vi.fn(),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    network: vi.fn(),
    error: vi.fn(),
}));

describe('dhtRediscovery phase edges', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 0));
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('aggressiveRediscovery consulta contactos recientes, luego entra en beacon mode y emite beacons periódicos', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const handlers = await import('../../../src/main_process/network/dht/handlers.js');
        const logger = await import('../../../src/main_process/security/secure-logger.js');
        const { aggressiveRediscovery } = await import('../../../src/main_process/network/dht/dhtRediscovery.js');

        vi.mocked(handlers.findNodeLocation).mockResolvedValue(null);
        vi.mocked(contactsOps.getContacts).mockReturnValue([
            { upeerId: 'peer-recent', address: '200::recent', lastSeen: Date.now() - 1_000 },
            { upeerId: 'peer-stale', address: '200::stale', lastSeen: Date.now() - 40 * 24 * 60 * 60 * 1000 },
        ] as never);

        const sendSecureUDPMessage = vi.fn();
        const rediscoveryPromise = aggressiveRediscovery('target-id', sendSecureUDPMessage);

        await vi.advanceTimersByTimeAsync(5_000);
        const result = await rediscoveryPromise;

        expect(result).toBeNull();
        expect(sendSecureUDPMessage).toHaveBeenCalledWith('200::recent', { type: 'PING' });
        expect(sendSecureUDPMessage).not.toHaveBeenCalledWith('200::stale', { type: 'PING' });

        await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
        await Promise.resolve();
        expect(sendSecureUDPMessage).toHaveBeenCalledTimes(1);
        expect(logger.network).toHaveBeenCalledWith('Entering beacon mode', undefined, { myId: 'target-id', duration: '24h' }, 'rediscovery');
    });

    it('startEnhancedBeaconMode cambia de fase: 5 min primero, luego 30 min, y termina limpiamente', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const logger = await import('../../../src/main_process/security/secure-logger.js');
        const { startEnhancedBeaconMode } = await import('../../../src/main_process/network/dht/dhtRediscovery.js');

        vi.mocked(contactsOps.getContacts).mockReturnValue([
            { upeerId: 'peer-a', address: '200::a' },
            { upeerId: 'peer-b', address: '200::b' },
        ] as never);

        const sendSecureUDPMessage = vi.fn();
        startEnhancedBeaconMode((24 * 60 * 60 * 1000) + (31 * 60 * 1000), sendSecureUDPMessage);

        await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
        expect(sendSecureUDPMessage).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync((24 * 60 * 60 * 1000) - (5 * 60 * 1000) + 1);
        vi.mocked(sendSecureUDPMessage).mockClear();
        await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 1);

        expect(sendSecureUDPMessage).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(60 * 1000 + 1);
        expect(logger.network).toHaveBeenCalledWith('Enhanced beacon mode ended', undefined, {}, 'beacon-enhanced');
    });
});
