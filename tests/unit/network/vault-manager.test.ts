import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultManager } from '../../../src/main_process/network/vault/manager.js';
import * as db from '../../../src/main_process/storage/db.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as shared from '../../../src/main_process/network/dht/shared.js';

// Mocks
vi.mock('../../../src/main_process/storage/db.js', () => ({
    getContacts: vi.fn(),
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'my-peer-id'),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    getVouchScore: vi.fn(async () => 50),
}));

vi.mock('../../../src/main_process/network/dht/shared.js', () => ({
    getKademliaInstance: vi.fn(),
}));

describe('VaultManager - getDynamicReplicationFactor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return MIN_REPLICATION_FACTOR for very high reputation (score >= 90)', async () => {
        const { getVouchScore } = await import('../../../src/main_process/security/reputation/vouches.js');
        vi.mocked(getVouchScore).mockResolvedValue(95);

        // @ts-ignore - Accediendo a método privado para test
        const factor = await VaultManager.getDynamicReplicationFactor('target-id');
        expect(factor).toBe(3); // MIN_REPLICATION_FACTOR
    });

    it('should return MAX_REPLICATION_FACTOR for low reputation (score <= 30)', async () => {
        const { getVouchScore } = await import('../../../src/main_process/security/reputation/vouches.js');
        vi.mocked(getVouchScore).mockResolvedValue(20);

        // @ts-ignore
        const factor = await VaultManager.getDynamicReplicationFactor('target-id');
        expect(factor).toBe(12); // MAX_REPLICATION_FACTOR
    });

    it('should return higher replication if the contact is new or unstable', async () => {
        const { getVouchScore } = await import('../../../src/main_process/security/reputation/vouches.js');
        vi.mocked(getVouchScore).mockResolvedValue(50);

        const { getContactByUpeerId } = await import('../../../src/main_process/storage/db.js');
        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: 'target-id',
            createdAt: new Date().toISOString(), // New
            lastSeen: new Date().toISOString(),
            status: 'connected'
        } as any);

        // @ts-ignore
        const factor = await VaultManager.getDynamicReplicationFactor('target-id');
        expect(factor).toBeGreaterThanOrEqual(6); // DEFAULT_REPLICATION_FACTOR o más
    });

    it('should correctly select candidates for replication and send messages', async () => {
        const { getContacts } = await import('../../../src/main_process/storage/db.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');

        const mockContacts = [
            { upeerId: 'friend-1', address: '127.0.0.1:1', status: 'connected', lastSeen: new Date().toISOString() },
            { upeerId: 'friend-2', address: '127.0.0.1:2', status: 'connected', lastSeen: new Date().toISOString() },
            { upeerId: 'friend-3', address: '127.0.0.1:3', status: 'connected', lastSeen: new Date().toISOString() },
            { upeerId: 'friend-4', address: '127.0.0.1:4', status: 'connected', lastSeen: new Date().toISOString() }
        ];
        // @ts-ignore
        vi.mocked(getContacts).mockResolvedValue(mockContacts);
        vi.mocked(sendSecureUDPMessage).mockResolvedValue(undefined);

        const packet = { type: 'CHAT', content: 'test msg' };

        // Espiamos el factor de replicación
        vi.spyOn(VaultManager as any, 'getDynamicReplicationFactor').mockResolvedValue(2);

        const nodesCount = await VaultManager.replicateToVaults('recipient-id', packet);

        expect(nodesCount).toBe(2);
        // Debe de haber llamado a sendSecureUDPMessage 2 veces
        expect(sendSecureUDPMessage).toHaveBeenCalledTimes(2);
    });

    it('should handle retries when sending fails initially', async () => {
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');

        // Simular fallo inicial y luego éxito
        vi.mocked(sendSecureUDPMessage)
            .mockRejectedValueOnce(new Error('UDP Timeout'))
            .mockResolvedValueOnce(undefined);

        // @ts-ignore - Accediendo a método privado para test de reintentos
        await VaultManager.sendWithRetry('127.0.0.1:999', { type: 'TEST' }, 3, 10);

        expect(sendSecureUDPMessage).toHaveBeenCalledTimes(2);
    });

    it('should only include successful custodians in DHT pointer', async () => {
        const { getContacts } = await import('../../../src/main_process/storage/db.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/shared.js');

        const mockContacts = [
            { upeerId: 'friend-success', address: '127.0.0.1:1', status: 'connected', lastSeen: new Date().toISOString() },
            { upeerId: 'friend-fail', address: '127.0.0.1:2', status: 'connected', lastSeen: new Date().toISOString() }
        ];
        vi.mocked(getContacts).mockResolvedValue(mockContacts as any);

        // Uno tiene éxito, el otro falla 3 veces
        vi.mocked(sendSecureUDPMessage)
            .mockResolvedValueOnce(undefined) // Success por node 1
            .mockRejectedValue(new Error('Fail')); // Fail por node 2 (todas las veces)

        const mockKademlia = {
            storeValue: vi.fn().mockResolvedValue(undefined)
        };
        vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as any);
        vi.spyOn(VaultManager as any, 'getDynamicReplicationFactor').mockResolvedValue(2);

        await VaultManager.replicateToVaults('recipient-id', { type: 'CHAT' });

        // Verificar que solo el exitante se envió a la DHT
        const callArgs = mockKademlia.storeValue.mock.calls[0];
        expect(callArgs[1].custodians).toContain('friend-success');
        expect(callArgs[1].custodians).not.toContain('friend-fail');
    });
});
