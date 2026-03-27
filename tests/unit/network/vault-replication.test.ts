import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContacts: vi.fn(),
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/shared.js', () => ({
    getDb: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
}));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/shared.js', () => ({
    getKademliaInstance: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/vault/operations.js', () => ({
    saveVaultEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    getVouchScore: vi.fn(),
}));

import { VaultManager } from '../../../src/main_process/network/vault/manager.js';
import * as contactsOps from '../../../src/main_process/storage/contacts/operations.js';
import * as identity from '../../../src/main_process/security/identity.js';
import * as transport from '../../../src/main_process/network/server/transport.js';
import * as dhtShared from '../../../src/main_process/network/dht/shared.js';
import * as reputation from '../../../src/main_process/security/reputation/vouches.js';

type VaultManagerInternals = typeof VaultManager & {
    getDynamicReplicationFactor(recipientSid: string): Promise<number>;
};
type KnownContact = Awaited<ReturnType<typeof contactsOps.getContacts>>[number];
type KnownRecipient = Awaited<ReturnType<typeof contactsOps.getContactByUpeerId>>;
type ReplicationPacket = Parameters<typeof VaultManager.replicateToVaults>[1];
type KademliaInstance = NonNullable<ReturnType<typeof dhtShared.getKademliaInstance>>;

describe('VaultManager - Replication Logic', () => {
    const myId = 'my-id';
    const recipientId = 'recipient-id';
    const vaultManagerInternals = VaultManager as VaultManagerInternals;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(identity.getMyUPeerId).mockReturnValue(myId);
    });

    it('should calculate dynamic replication factor based on score', async () => {
        vi.mocked(reputation.getVouchScore).mockResolvedValue(95);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ createdAt: Date.now() - 100 * 24 * 3600000 } as KnownRecipient);
        const factorHigh = await vaultManagerInternals.getDynamicReplicationFactor(recipientId);
        expect(factorHigh).toBe(3);

        vi.mocked(reputation.getVouchScore).mockResolvedValue(20);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ createdAt: Date.now() } as KnownRecipient);
        const factorLow = await vaultManagerInternals.getDynamicReplicationFactor(recipientId);
        expect(factorLow).toBe(12);

        vi.mocked(reputation.getVouchScore).mockResolvedValue(50);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({ createdAt: Date.now() - 31 * 24 * 3600000 } as KnownRecipient);
        const factorMid = await vaultManagerInternals.getDynamicReplicationFactor(recipientId);
        expect(factorMid).toBe(6);
    });

    it('should only store pointers in DHT for successful replications', async () => {
        const contact1 = { upeerId: 'peer1', address: '1.1.1.1', status: 'connected' } as KnownContact;
        const contact2 = { upeerId: 'peer2', address: '2.2.2.2', status: 'connected' } as KnownContact;
        const replicatedPacket: ReplicationPacket = { type: 'CHAT', data: 'hi' };

        vi.mocked(contactsOps.getContacts).mockResolvedValue([contact1, contact2]);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({} as KnownRecipient);
        vi.mocked(reputation.getVouchScore).mockResolvedValue(55);

        vi.mocked(transport.sendSecureUDPMessage).mockImplementation((addr: string) => {
            if (addr === '1.1.1.1') return Promise.resolve();
            return Promise.reject(new Error('Network error'));
        });

        const mockKademlia = {
            findClosestContacts: vi.fn().mockReturnValue([]),
            storeValue: vi.fn().mockResolvedValue(undefined),
        } satisfies Pick<KademliaInstance, 'findClosestContacts' | 'storeValue'>;
        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(mockKademlia as KademliaInstance);

        vi.spyOn(vaultManagerInternals, 'getDynamicReplicationFactor').mockResolvedValue(2);

        await VaultManager.replicateToVaults(recipientId, replicatedPacket);

        expect(transport.sendSecureUDPMessage).toHaveBeenCalled();

        expect(mockKademlia.storeValue).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                custodians: expect.arrayContaining(['peer1'])
            }),
            myId
        );

        const lastCall = mockKademlia.storeValue.mock.calls[0][1];
        expect(lastCall.custodians).not.toContain('peer2');
        expect(lastCall.custodians).toContain('peer1');
    });

    it('should fallback to Kademlia nodes if no friends are connected', async () => {
        vi.mocked(contactsOps.getContacts).mockResolvedValue([]);

        const meshNode = { upeerId: 'mesh1', address: '3.3.3.3', status: 'connected' } as KnownContact;
        const mockKademlia = {
            findClosestContacts: vi.fn().mockReturnValue([meshNode]),
            storeValue: vi.fn().mockResolvedValue(undefined),
        } satisfies Pick<KademliaInstance, 'findClosestContacts' | 'storeValue'>;
        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(mockKademlia as KademliaInstance);
        vi.mocked(reputation.getVouchScore).mockResolvedValue(50);

        await VaultManager.replicateToVaults(recipientId, { type: 'CHAT', data: 'hi' });

        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith('3.3.3.3', expect.anything());
    });
});
