import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VaultManager } from '../../../src/main_process/network/vault/manager.js';

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContacts: vi.fn(),
    getContactByUpeerId: vi.fn(async () => undefined),
}));

vi.mock('../../../src/main_process/storage/vault/operations.js', () => ({
    saveVaultEntry: vi.fn(async () => undefined),
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
    sendSecureUDPMessage: vi.fn(async () => undefined),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    getVouchScore: vi.fn(async () => 50),
}));

vi.mock('../../../src/main_process/network/dht/shared.js', () => ({
    getKademliaInstance: vi.fn(),
}));

describe('vault manager small-network attachment cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('stores FILE_PROPOSAL locally when only sender and offline recipient exist', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const vaultOps = await import('../../../src/main_process/storage/vault/operations.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const dhtShared = await import('../../../src/main_process/network/dht/shared.js');

        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(null);
        vi.mocked(contactsOps.getContacts).mockResolvedValue([
            { upeerId: 'peer-2', address: '200::peer-2', status: 'disconnected' }
        ] as never);

        const packet = {
            type: 'FILE_PROPOSAL',
            fileId: '550e8400-e29b-41d4-a716-4466554400cc',
            fileName: 'offline.bin',
            fileSize: 4096,
            mimeType: 'application/octet-stream',
            totalChunks: 4,
            chunkSize: 1024,
            fileHash: 'e'.repeat(64),
            signature: 'sig',
            senderUpeerId: 'self-id'
        };

        const nodes = await VaultManager.replicateToVaults('peer-2', packet);

        expect(nodes).toBe(1);
        expect(transport.sendSecureUDPMessage).not.toHaveBeenCalled();
        expect(vaultOps.saveVaultEntry).toHaveBeenCalledOnce();
        const [, recipientSid, senderSid, , data] = vi.mocked(vaultOps.saveVaultEntry).mock.calls[0];
        expect(recipientSid).toBe('peer-2');
        expect(senderSid).toBe('self-id');
        expect(JSON.parse(Buffer.from(data, 'hex').toString())).toEqual(packet);
    });

    it('queries the single online peer when the network is only two peers', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const dhtShared = await import('../../../src/main_process/network/dht/shared.js');

        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(null);
        vi.mocked(contactsOps.getContacts).mockResolvedValue([
            { upeerId: 'self-id', address: '200::self', status: 'connected' },
            { upeerId: 'peer-1', address: '200::peer-1', status: 'connected' }
        ] as never);

        await VaultManager.queryOwnVaults();

        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(1);
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::peer-1',
            expect.objectContaining({ type: 'VAULT_QUERY', requesterSid: 'self-id' })
        );
    });

    it('queries the single known peer even if it is still marked disconnected', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const dhtShared = await import('../../../src/main_process/network/dht/shared.js');

        vi.mocked(dhtShared.getKademliaInstance).mockReturnValue(null);
        vi.mocked(contactsOps.getContacts).mockResolvedValue([
            { upeerId: 'self-id', address: '200::self', status: 'connected' },
            { upeerId: 'peer-1', address: '200::peer-1', status: 'disconnected' }
        ] as never);

        await VaultManager.queryOwnVaults();

        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(1);
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::peer-1',
            expect.objectContaining({ type: 'VAULT_QUERY', requesterSid: 'self-id' })
        );
    });
});
