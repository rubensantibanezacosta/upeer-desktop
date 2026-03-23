import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultManager } from '../../../src/main_process/network/vault/manager.js';

// Mocks
vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContacts: vi.fn(),
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/vault/operations.js', () => ({
    saveVaultEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
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

        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
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
        const { getContacts } = await import('../../../src/main_process/storage/contacts/operations.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { saveVaultEntry } = await import('../../../src/main_process/storage/vault/operations.js');

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
        vi.spyOn(VaultManager as any, 'getDynamicReplicationFactor').mockResolvedValue(2);

        const nodesCount = await VaultManager.replicateToVaults('recipient-id', packet);

        expect(nodesCount).toBe(3);
        expect(sendSecureUDPMessage).toHaveBeenCalledTimes(2);
        expect(saveVaultEntry).toHaveBeenCalledOnce();
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
        const { getContacts } = await import('../../../src/main_process/storage/contacts/operations.js');
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

        const callArgs = mockKademlia.storeValue.mock.calls[0];
        expect(callArgs[1].custodians).toContain('my-peer-id');
        expect(callArgs[1].custodians).toContain('friend-success');
        expect(callArgs[1].custodians).not.toContain('friend-fail');
    });
});

describe('VaultManager.replicateToVaults — self-custodian fallback (2-peer network)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stores message locally when only 2 peers and recipient is offline', async () => {
        const { getContacts } = await import('../../../src/main_process/storage/contacts/operations.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { saveVaultEntry } = await import('../../../src/main_process/storage/vault/operations.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/shared.js');

        vi.mocked(getKademliaInstance).mockReturnValue(null);

        // Escenario real: getContacts() no incluye al propio nodo — solo el contacto offline.
        // Sin terceros disponibles ni kademlia → ningún candidato → saveVaultEntry como self-custodian.
        vi.mocked(getContacts).mockResolvedValue([
            { upeerId: 'recipient-offline', address: '200::2', status: 'disconnected', lastSeen: new Date().toISOString() }
        ] as any);

        vi.spyOn(VaultManager as any, 'getDynamicReplicationFactor').mockResolvedValue(3);

        const packet = { type: 'CHAT', content: 'hola que pasa' };
        const result = await VaultManager.replicateToVaults('recipient-offline', packet);

        expect(result).toBe(1);
        expect(sendSecureUDPMessage).not.toHaveBeenCalled();
        expect(saveVaultEntry).toHaveBeenCalledOnce();

        const [hash, recipientSid, senderSid, priority, data, expiresAt] = vi.mocked(saveVaultEntry).mock.calls[0];
        expect(typeof hash).toBe('string');
        expect(hash).toHaveLength(64);
        expect(recipientSid).toBe('recipient-offline');
        expect(senderSid).toBe('my-peer-id');
        expect(priority).toBe(1);
        expect(JSON.parse(Buffer.from(data, 'hex').toString())).toEqual(packet);
        expect(expiresAt).toBeGreaterThan(Date.now());
    });

    it('stores message locally when kademlia returns no extra nodes and all candidates are filtered', async () => {
        const { getContacts } = await import('../../../src/main_process/storage/contacts/operations.js');
        const { saveVaultEntry } = await import('../../../src/main_process/storage/vault/operations.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/shared.js');

        const mockKademlia = { findClosestContacts: vi.fn().mockReturnValue([]) };
        vi.mocked(getKademliaInstance).mockReturnValue(mockKademlia as any);

        // Solo el recipient offline — kademlia devuelve array vacío → ningún candidato
        vi.mocked(getContacts).mockResolvedValue([
            { upeerId: 'target-peer', address: '200::2', status: 'disconnected' }
        ] as any);

        vi.spyOn(VaultManager as any, 'getDynamicReplicationFactor').mockResolvedValue(6);

        const result = await VaultManager.replicateToVaults('target-peer', { type: 'CHAT', content: 'msg' });

        expect(result).toBe(1);
        expect(saveVaultEntry).toHaveBeenCalledOnce();
    });

    it('stores message locally when the only other peer is the recipient still marked connected', async () => {
        const { getContacts } = await import('../../../src/main_process/storage/contacts/operations.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { saveVaultEntry } = await import('../../../src/main_process/storage/vault/operations.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/shared.js');

        vi.mocked(getKademliaInstance).mockReturnValue(null);
        vi.mocked(getContacts).mockResolvedValue([
            { upeerId: 'recipient-stale', address: '200::2', status: 'connected', lastSeen: new Date().toISOString() }
        ] as any);

        vi.spyOn(VaultManager as any, 'getDynamicReplicationFactor').mockResolvedValue(3);

        const result = await VaultManager.replicateToVaults('recipient-stale', { type: 'CHAT', content: 'msg' });

        expect(result).toBe(1);
        expect(sendSecureUDPMessage).not.toHaveBeenCalled();
        expect(saveVaultEntry).toHaveBeenCalledOnce();
    });

    it('uses self-custodian and third-party custodians when available', async () => {
        const { getContacts } = await import('../../../src/main_process/storage/contacts/operations.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { saveVaultEntry } = await import('../../../src/main_process/storage/vault/operations.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/shared.js');

        vi.mocked(getKademliaInstance).mockReturnValue(null);
        vi.mocked(sendSecureUDPMessage).mockResolvedValue(undefined);

        vi.mocked(getContacts).mockResolvedValue([
            { upeerId: 'my-peer-id', address: '200::1', status: 'connected' },
            { upeerId: 'target-peer', address: '200::2', status: 'disconnected' },
            { upeerId: 'third-party-1', address: '200::3', status: 'connected', lastSeen: new Date().toISOString() },
            { upeerId: 'third-party-2', address: '200::4', status: 'connected', lastSeen: new Date().toISOString() }
        ] as any);

        vi.spyOn(VaultManager as any, 'getDynamicReplicationFactor').mockResolvedValue(2);

        const result = await VaultManager.replicateToVaults('target-peer', { type: 'CHAT' });

        expect(result).toBe(3);
        expect(sendSecureUDPMessage).toHaveBeenCalledTimes(2);
        expect(saveVaultEntry).toHaveBeenCalledOnce();
    });

    it('self-custodian stores data with TTL that does not exceed VAULT_TTL_MS', async () => {
        const { getContacts } = await import('../../../src/main_process/storage/contacts/operations.js');
        const { saveVaultEntry } = await import('../../../src/main_process/storage/vault/operations.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/shared.js');

        vi.mocked(getKademliaInstance).mockReturnValue(null);
        // Sin self en la lista → ningún candidato → saveVaultEntry
        vi.mocked(getContacts).mockResolvedValue([
            { upeerId: 'offline-peer', address: '200::2', status: 'disconnected' }
        ] as any);

        vi.spyOn(VaultManager as any, 'getDynamicReplicationFactor').mockResolvedValue(3);

        const beforeCall = Date.now();
        await VaultManager.replicateToVaults('offline-peer', { type: 'CHAT' });
        const afterCall = Date.now();

        const { VAULT_TTL_MS } = await import('../../../src/main_process/network/vault/manager.js');
        const [, , , , , expiresAt] = vi.mocked(saveVaultEntry).mock.calls[0];

        expect(expiresAt).toBeGreaterThanOrEqual(beforeCall + VAULT_TTL_MS - 100);
        expect(expiresAt).toBeLessThanOrEqual(afterCall + VAULT_TTL_MS + 100);
    });

    it('uses payloadHashOverride when provided in self-custodian path', async () => {
        const { getContacts } = await import('../../../src/main_process/storage/contacts/operations.js');
        const { saveVaultEntry } = await import('../../../src/main_process/storage/vault/operations.js');
        const { getKademliaInstance } = await import('../../../src/main_process/network/dht/shared.js');

        vi.mocked(getKademliaInstance).mockReturnValue(null);
        vi.mocked(getContacts).mockResolvedValue([
            { upeerId: 'offline', status: 'disconnected' }
        ] as any);

        vi.spyOn(VaultManager as any, 'getDynamicReplicationFactor').mockResolvedValue(3);

        const fixedHash = 'a'.repeat(64);
        await VaultManager.replicateToVaults('offline', { type: 'CHAT' }, undefined, fixedHash);

        const [storedHash] = vi.mocked(saveVaultEntry).mock.calls[0];
        expect(storedHash).toBe(fixedHash);
    });
});
