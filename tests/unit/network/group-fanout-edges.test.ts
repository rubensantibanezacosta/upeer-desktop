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
    sendSecurePacket: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/handlers.js', () => ({
    getKademliaInstance: vi.fn(),
}));

vi.mock('../../../src/main_process/network/locationBlocks.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/main_process/network/locationBlocks.js')>();
    return { ...actual, verifyLocationBlockWithDHT: vi.fn() };
});

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
        expect(transport.sendSecurePacket).toHaveBeenCalledTimes(3);
        expect(transport.sendSecurePacket).toHaveBeenCalledWith(
            '200::10',
            expect.objectContaining({ type: 'GROUP_MSG', groupId: 'grp-edge', senderUpeerId: 'self-id' }),
            'aa'.repeat(32),
        );
        expect(transport.sendSecurePacket).toHaveBeenCalledWith(
            '200::11',
            expect.objectContaining({ type: 'GROUP_MSG', groupId: 'grp-edge', senderUpeerId: 'self-id' }),
            'aa'.repeat(32),
        );
        expect(transport.sendSecurePacket).toHaveBeenCalledWith(
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

    it('envía a un miembro del roster sin contacto usando una ubicación DHT verificada', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const dht = await import('../../../src/main_process/network/dht/handlers.js');
        const locationBlocks = await import('../../../src/main_process/network/locationBlocks.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');
        const publicKey = 'aa'.repeat(32);
        const location = { address: '200::2', addresses: ['200::2'], dhtSeq: 4, expiresAt: Date.now() + 60_000, signature: 'bb'.repeat(64) };

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-roster-only',
            name: 'Grupo',
            adminUpeerId: 'self-id',
            status: 'active',
            members: ['self-id', 'member-id'],
            memberPublicKeys: { 'member-id': publicKey },
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as never);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(undefined);
        vi.mocked(dht.getKademliaInstance).mockReturnValue({ findLocationBlock: vi.fn().mockResolvedValue(location) } as never);
        vi.mocked(locationBlocks.verifyLocationBlockWithDHT).mockResolvedValue(true);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

        await sendGroupMessage('grp-roster-only', 'hola miembro');

        expect(transport.sendSecurePacket).toHaveBeenCalledWith(
            '200::2',
            expect.objectContaining({ type: 'GROUP_MSG', groupId: 'grp-roster-only' }),
            publicKey,
        );
    });

    it('rechaza el envío al miembro sin contacto si la ubicación DHT no está firmada por su clave', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const dht = await import('../../../src/main_process/network/dht/handlers.js');
        const locationBlocks = await import('../../../src/main_process/network/locationBlocks.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const location = { address: '200::3', dhtSeq: 1, expiresAt: Date.now() + 60_000, signature: 'ff'.repeat(64) };

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-invalid-location',
            name: 'Grupo',
            adminUpeerId: 'self-id',
            status: 'active',
            members: ['self-id', 'member-id'],
            memberPublicKeys: { 'member-id': 'aa'.repeat(32) },
            epoch: 1,
            senderKey: 'cc'.repeat(32),
        } as never);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(undefined);
        vi.mocked(dht.getKademliaInstance).mockReturnValue({ findLocationBlock: vi.fn().mockResolvedValue(location) } as never);
        vi.mocked(locationBlocks.verifyLocationBlockWithDHT).mockResolvedValue(false);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as never);

        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');
        await sendGroupMessage('grp-invalid-location', 'no falsificar');

        expect(transport.sendSecurePacket).not.toHaveBeenCalledWith('200::3', expect.anything(), expect.anything());
    });
});
