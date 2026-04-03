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

describe('groups fan-out edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('deduplica miembros repetidos y combina online/offline/self sin duplicar envíos', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const dhtHandlers = await import('../../../src/main_process/network/dht/handlers.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-edge',
            name: 'Grupo edge',
            status: 'active',
            members: ['self-id', 'peer-online', 'peer-online', 'peer-offline', 'peer-offline'],
            epoch: 3,
            senderKey: 'cc'.repeat(32),
        } as never);
        vi.mocked(contactsOps.getContactByUpeerId).mockImplementation((upeerId: string) => {
            if (upeerId === 'peer-online') {
                return {
                    upeerId,
                    status: 'connected',
                    publicKey: 'aa'.repeat(32),
                    address: '200::10',
                    knownAddresses: JSON.stringify(['200::11', '200::10']),
                } as never;
            }
            if (upeerId === 'peer-offline') {
                return {
                    upeerId,
                    status: 'disconnected',
                    publicKey: 'bb'.repeat(32),
                    address: '200::20',
                    knownAddresses: '[]',
                } as never;
            }
            return undefined;
        });
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);
        vi.mocked(dhtHandlers.getKademliaInstance).mockReturnValue({
            findClosestContacts: vi.fn(() => [
                { upeerId: 'self-id', address: '200::other-device' },
                { upeerId: 'self-id', address: '200::self' },
            ]),
        } as never);

        const result = await sendGroupMessage('grp-edge', 'hola edge');

        expect(result).toEqual(expect.objectContaining({ savedMessage: 'hola edge' }));
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(3);
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::10',
            expect.objectContaining({ type: 'GROUP_MSG', groupId: 'grp-edge', senderUpeerId: 'self-id' }),
            'aa'.repeat(32),
            false
        );
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::11',
            expect.objectContaining({ type: 'GROUP_MSG', groupId: 'grp-edge', senderUpeerId: 'self-id' }),
            'aa'.repeat(32),
            false
        );
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::other-device',
            expect.objectContaining({ type: 'GROUP_MSG', groupId: 'grp-edge', senderUpeerId: 'self-id' }),
            '11'.repeat(32),
            true
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledTimes(1);
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-offline',
            expect.objectContaining({ type: 'GROUP_MSG', groupId: 'grp-edge', senderUpeerId: 'self-id' }),
            undefined,
            expect.any(String)
        );
    });
});
