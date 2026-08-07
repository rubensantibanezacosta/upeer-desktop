import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    getGroupById: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveMessage: vi.fn(),
    updateMessageStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyPublicKeyHex: vi.fn(() => '11'.repeat(32)),
    getMyPublicKey: vi.fn(() => Buffer.from('11'.repeat(32), 'hex')),
    getMyUPeerId: vi.fn(() => 'self-id'),
    sign: vi.fn(() => Buffer.from('sig')),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
    error: vi.fn(),
}));

vi.mock('../../../src/main_process/network/groupState.js', () => ({
    encryptGroupMessage: vi.fn(() => ({ ciphertext: 'group-cipher', nonce: 'group-nonce' })),
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    canonicalStringify: vi.fn((data) => JSON.stringify(data)),
}));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/handlers.js', () => ({
    getKademliaInstance: vi.fn(),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        replicateToVaults: vi.fn(),
    },
}));

vi.mock('../../../src/main_process/sidecars/yggstack.js', () => ({
    getYggstackAddress: vi.fn(() => '200::self'),
}));

describe('group fan-out concurrency', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('envía a N miembros online en paralelo sin perder mensajes', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');

        const memberCount = 40;
        const members = ['self-id'];
        for (let i = 0; i < memberCount; i += 1) members.push(`peer-${i}`);
        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-big',
            name: 'Grupo grande',
            status: 'active',
            members,
            epoch: 5,
            senderKey: 'cc'.repeat(32),
        } as never);
        vi.mocked(contactsOps.getContactByUpeerId).mockImplementation((upeerId: string) => {
            if (upeerId === 'self-id') {
                return { upeerId, status: 'connected', publicKey: '11'.repeat(32), knownAddresses: '[]' } as never;
            }
            return {
                upeerId,
                status: 'connected',
                publicKey: 'aa'.repeat(32),
                address: `200::${upeerId}`,
                knownAddresses: '[]',
            } as never;
        });
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

        const result = await sendGroupMessage('grp-big', 'hola a todos');

        expect(result).toEqual(expect.objectContaining({ savedMessage: 'hola a todos' }));
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(memberCount);
        expect(VaultManager.replicateToVaults).toHaveBeenCalledTimes(1);
    });

    it('vaultea a los miembros offline mientras envía por UDP a los online', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');

        const members = ['self-id', 'peer-online', 'peer-offline'];
        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-mix',
            name: 'Grupo mixto',
            status: 'active',
            members,
            epoch: 2,
            senderKey: 'cc'.repeat(32),
        } as never);
        vi.mocked(contactsOps.getContactByUpeerId).mockImplementation((upeerId: string) => {
            if (upeerId === 'self-id') return { upeerId, status: 'connected', publicKey: '11'.repeat(32), knownAddresses: '[]' } as never;
            if (upeerId === 'peer-online') return { upeerId, status: 'connected', publicKey: 'aa'.repeat(32), address: '200::online', knownAddresses: '[]' } as never;
            return { upeerId, status: 'disconnected', publicKey: 'bb'.repeat(32), address: '200::offline', knownAddresses: '[]' } as never;
        });
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

        await sendGroupMessage('grp-mix', 'mix');

        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(1);
        expect(VaultManager.replicateToVaults).toHaveBeenCalledTimes(2);
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-offline',
            expect.objectContaining({ type: 'GROUP_MSG', groupId: 'grp-mix' }),
            undefined,
            expect.any(String)
        );
    });

    it('vaultea a N miembros offline en paralelo sin perder ninguno', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');

        const members = ['self-id'];
        const offlineCount = 40;
        for (let i = 0; i < offlineCount; i += 1) {
            members.push(`off-${i}`);
        }
        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-all-off',
            name: 'Grupo todo offline',
            status: 'active',
            members,
            epoch: 4,
            senderKey: 'cc'.repeat(32),
        } as never);
        vi.mocked(contactsOps.getContactByUpeerId).mockImplementation((upeerId: string) => {
            if (upeerId === 'self-id') return { upeerId, status: 'connected', publicKey: '11'.repeat(32), knownAddresses: '[]' } as never;
            return { upeerId, status: 'disconnected', publicKey: 'bb'.repeat(32), knownAddresses: '[]' } as never;
        });
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

        await sendGroupMessage('grp-all-off', 'offline a todos');

        expect(VaultManager.replicateToVaults).toHaveBeenCalledTimes(offlineCount + 1);
        for (let i = 0; i < offlineCount; i += 1) {
            expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
                `off-${i}`,
                expect.objectContaining({ type: 'GROUP_MSG', groupId: 'grp-all-off' }),
                undefined,
                expect.any(String)
            );
        }
    });
});
