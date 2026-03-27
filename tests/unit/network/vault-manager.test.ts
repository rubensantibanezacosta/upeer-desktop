import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultManager } from '../../../src/main_process/network/vault/manager.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations.js';
import * as vaultOps from '../../../src/main_process/storage/vault/operations.js';
import * as transport from '../../../src/main_process/network/server/transport.js';
import * as reputation from '../../../src/main_process/security/reputation/vouches.js';
import * as dhtShared from '../../../src/main_process/network/dht/shared.js';

type VaultManagerPrivate = typeof VaultManager & {
    getDynamicReplicationFactor: (targetUpeerId: string) => Promise<number>;
    sendWithRetry: (address: string, packet: Record<string, unknown>, maxRetries: number, baseDelayMs: number) => Promise<void>;
};
type KnownContact = Awaited<ReturnType<typeof contactsOps.getContacts>>[number];
type KnownRecipient = Awaited<ReturnType<typeof contactsOps.getContactByUpeerId>>;
type KademliaInstance = NonNullable<ReturnType<typeof dhtShared.getKademliaInstance>>;

const vaultManagerPrivate = VaultManager as VaultManagerPrivate;

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
        vi.mocked(reputation.getVouchScore).mockResolvedValue(95);

        const factor = await vaultManagerPrivate.getDynamicReplicationFactor('target-id');
        expect(factor).toBe(3);
    });

    it('should return MAX_REPLICATION_FACTOR for low reputation (score <= 30)', async () => {
        vi.mocked(reputation.getVouchScore).mockResolvedValue(20);

        const factor = await vaultManagerPrivate.getDynamicReplicationFactor('target-id');
        expect(factor).toBe(12);
    });

    it('should return higher replication if the contact is new or unstable', async () => {
        vi.mocked(reputation.getVouchScore).mockResolvedValue(50);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'target-id',
            createdAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            status: 'connected'
        } as KnownRecipient);

        const factor = await vaultManagerPrivate.getDynamicReplicationFactor('target-id');
        expect(factor).toBeGreaterThanOrEqual(6);
    });

    it('should correctly select candidates for replication and send messages', async () => {
        const mockContacts = [
            { upeerId: 'friend-1', address: '127.0.0.1:1', status: 'connected', lastSeen: new Date().toISOString() },
            { upeerId: 'friend-2', address: '127.0.0.1:2', status: 'connected', lastSeen: new Date().toISOString() },
            { upeerId: 'friend-3', address: '127.0.0.1:3', status: 'connected', lastSeen: new Date().toISOString() },
            { upeerId: 'friend-4', address: '127.0.0.1:4', status: 'connected', lastSeen: new Date().toISOString() }
        ] as KnownContact[];
        vi.mocked(contactsOps.getContacts).mockResolvedValue(mockContacts);
        vi.mocked(transport.sendSecureUDPMessage).mockResolvedValue(undefined);

        const packet = { type: 'CHAT', content: 'test msg' };
        vi.spyOn(vaultManagerPrivate, 'getDynamicReplicationFactor').mockResolvedValue(2);

        const nodesCount = await VaultManager.replicateToVaults('recipient-id', packet);

        expect(nodesCount).toBe(3);
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(2);
        expect(vaultOps.saveVaultEntry).toHaveBeenCalledOnce();
    });

    it('should handle retries when sending fails initially', async () => {
        vi.mocked(transport.sendSecureUDPMessage)
            .mockRejectedValueOnce(new Error('UDP Timeout'))
            .mockResolvedValueOnce(undefined);

        await vaultManagerPrivate.sendWithRetry('127.0.0.1:999', { type: 'TEST' }, 3, 10);

        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(2);
    });

    it('should only include successful custodians in DHT pointer', async () => {
        const mockContacts = [
            { upeerId: 'friend-success', address: '127.0.0.1:1', status: 'connected', lastSeen: new Date().toISOString() },
            { upeerId: 'friend-fail', address: '127.0.0.1:2', status: 'connected', lastSeen: new Date().toISOString() }
        ] as KnownContact[];
        vi.mocked(contactsOps.getContacts).mockResolvedValue(mockContacts);

        vi.mocked(transport.sendSecureUDPMessage)
            .mockResolvedValueOnce(undefined)
            .mockRejectedValue(new Error('Fail'));

        const mockKademlia = {
            storeValue: vi.fn().mockResolvedValue(undefined)
        } satisfies Pick<KademliaInstance, 'storeValue'>;
        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(mockKademlia as KademliaInstance);
        vi.spyOn(vaultManagerPrivate, 'getDynamicReplicationFactor').mockResolvedValue(2);

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
        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(null);
        vi.mocked(contactsOps.getContacts).mockResolvedValue([
            { upeerId: 'recipient-offline', address: '200::2', status: 'disconnected', lastSeen: new Date().toISOString() }
        ] as KnownContact[]);

        vi.spyOn(vaultManagerPrivate, 'getDynamicReplicationFactor').mockResolvedValue(3);

        const packet = { type: 'CHAT', content: 'hola que pasa' };
        const result = await VaultManager.replicateToVaults('recipient-offline', packet);

        expect(result).toBe(1);
        expect(transport.sendSecureUDPMessage).not.toHaveBeenCalled();
        expect(vaultOps.saveVaultEntry).toHaveBeenCalledOnce();

        const [hash, recipientSid, senderSid, priority, data, expiresAt] = vi.mocked(vaultOps.saveVaultEntry).mock.calls[0];
        expect(typeof hash).toBe('string');
        expect(hash).toHaveLength(64);
        expect(recipientSid).toBe('recipient-offline');
        expect(senderSid).toBe('my-peer-id');
        expect(priority).toBe(1);
        expect(JSON.parse(Buffer.from(data, 'hex').toString())).toEqual(packet);
        expect(expiresAt).toBeGreaterThan(Date.now());
    });

    it('stores message locally when kademlia returns no extra nodes and all candidates are filtered', async () => {
        const mockKademlia = { findClosestContacts: vi.fn().mockReturnValue([]) };
        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(mockKademlia as KademliaInstance);

        vi.mocked(contactsOps.getContacts).mockResolvedValue([
            { upeerId: 'target-peer', address: '200::2', status: 'disconnected' }
        ] as KnownContact[]);

        vi.spyOn(vaultManagerPrivate, 'getDynamicReplicationFactor').mockResolvedValue(6);

        const result = await VaultManager.replicateToVaults('target-peer', { type: 'CHAT', content: 'msg' });

        expect(result).toBe(1);
        expect(vaultOps.saveVaultEntry).toHaveBeenCalledOnce();
    });

    it('stores message locally when the only other peer is the recipient still marked connected', async () => {
        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(null);
        vi.mocked(contactsOps.getContacts).mockResolvedValue([
            { upeerId: 'recipient-stale', address: '200::2', status: 'connected', lastSeen: new Date().toISOString() }
        ] as KnownContact[]);

        vi.spyOn(vaultManagerPrivate, 'getDynamicReplicationFactor').mockResolvedValue(3);

        const result = await VaultManager.replicateToVaults('recipient-stale', { type: 'CHAT', content: 'msg' });

        expect(result).toBe(1);
        expect(transport.sendSecureUDPMessage).not.toHaveBeenCalled();
        expect(vaultOps.saveVaultEntry).toHaveBeenCalledOnce();
    });

    it('uses self-custodian and third-party custodians when available', async () => {
        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(null);
        vi.mocked(transport.sendSecureUDPMessage).mockResolvedValue(undefined);

        vi.mocked(contactsOps.getContacts).mockResolvedValue([
            { upeerId: 'my-peer-id', address: '200::1', status: 'connected' },
            { upeerId: 'target-peer', address: '200::2', status: 'disconnected' },
            { upeerId: 'third-party-1', address: '200::3', status: 'connected', lastSeen: new Date().toISOString() },
            { upeerId: 'third-party-2', address: '200::4', status: 'connected', lastSeen: new Date().toISOString() }
        ] as KnownContact[]);

        vi.spyOn(vaultManagerPrivate, 'getDynamicReplicationFactor').mockResolvedValue(2);

        const result = await VaultManager.replicateToVaults('target-peer', { type: 'CHAT' });

        expect(result).toBe(3);
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(2);
        expect(vaultOps.saveVaultEntry).toHaveBeenCalledOnce();
    });

    it('self-custodian stores data with TTL that does not exceed VAULT_TTL_MS', async () => {
        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(null);
        vi.mocked(contactsOps.getContacts).mockResolvedValue([
            { upeerId: 'offline-peer', address: '200::2', status: 'disconnected' }
        ] as KnownContact[]);

        vi.spyOn(vaultManagerPrivate, 'getDynamicReplicationFactor').mockResolvedValue(3);

        const beforeCall = Date.now();
        await VaultManager.replicateToVaults('offline-peer', { type: 'CHAT' });
        const afterCall = Date.now();

        const { VAULT_TTL_MS } = await import('../../../src/main_process/network/vault/manager.js');
        const [, , , , , expiresAt] = vi.mocked(vaultOps.saveVaultEntry).mock.calls[0];

        expect(expiresAt).toBeGreaterThanOrEqual(beforeCall + VAULT_TTL_MS - 100);
        expect(expiresAt).toBeLessThanOrEqual(afterCall + VAULT_TTL_MS + 100);
    });

    it('uses payloadHashOverride when provided in self-custodian path', async () => {
        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(null);
        vi.mocked(contactsOps.getContacts).mockResolvedValue([
            { upeerId: 'offline', status: 'disconnected' }
        ] as KnownContact[]);

        vi.spyOn(vaultManagerPrivate, 'getDynamicReplicationFactor').mockResolvedValue(3);

        const fixedHash = 'a'.repeat(64);
        await VaultManager.replicateToVaults('offline', { type: 'CHAT' }, undefined, fixedHash);

        const [storedHash] = vi.mocked(vaultOps.saveVaultEntry).mock.calls[0];
        expect(storedHash).toBe(fixedHash);
    });
});
