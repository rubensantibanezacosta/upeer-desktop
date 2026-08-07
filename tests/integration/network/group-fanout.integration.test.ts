import { beforeEach, describe, expect, it, vi } from 'vitest';

const contactStatuses: Record<string, { status: string; publicKey: string; address?: string }> = {};

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn((upeerId: string) => contactStatuses[upeerId] ?? null),
}));

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    getGroupById: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveMessage: vi.fn(() => Promise.resolve({ changes: 1 })),
    updateMessageStatus: vi.fn(() => Promise.resolve(false)),
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
    info: vi.fn(),
    debug: vi.fn(),
    security: vi.fn(),
}));

vi.mock('../../../src/main_process/network/groupState.js', () => ({
    encryptGroupMessage: vi.fn(() => ({ ciphertext: 'group-cipher', nonce: 'group-nonce' })),
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    canonicalStringify: vi.fn((data: unknown) => JSON.stringify(data)),
}));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/handlers.js', () => ({
    getKademliaInstance: vi.fn(),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        replicateToVaults: vi.fn(async () => 1),
    },
}));

vi.mock('../../../src/main_process/sidecars/yggstack.js', () => ({
    getYggstackAddress: vi.fn(() => '200::self'),
}));

describe('group fan-out integration', () => {
    beforeEach(() => {
        Object.keys(contactStatuses).forEach((key) => delete contactStatuses[key]);
        vi.clearAllMocks();
    });

    it('entrega un mensaje a todos los miembros online y vaultea a los offline en un grupo grande', async () => {
        const contactOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');

        const onlineCount = 30;
        const members = ['self-id'];
        contactStatuses['self-id'] = { status: 'connected', publicKey: '11'.repeat(32) };
        for (let i = 0; i < onlineCount; i += 1) {
            const id = `peer-${i}`;
            members.push(id);
            contactStatuses[id] = { status: 'connected', publicKey: 'aa'.repeat(32), address: `200::${id}` };
        }
        members.push('offline-peer');
        contactStatuses['offline-peer'] = { status: 'disconnected', publicKey: 'bb'.repeat(32), address: '200::offline' };

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-int',
            name: 'Grupo integración',
            status: 'active',
            members,
            epoch: 7,
            senderKey: 'cc'.repeat(32),
        } as never);

        const result = await sendGroupMessage('grp-int', 'mensaje de integración');

        expect(result).toEqual(expect.objectContaining({ savedMessage: 'mensaje de integración' }));
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(onlineCount);
        expect(VaultManager.replicateToVaults).toHaveBeenCalledTimes(2);
        for (const member of members) {
            expect(contactOps.getContactByUpeerId).toHaveBeenCalledWith(member);
        }
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'offline-peer',
            expect.objectContaining({ type: 'GROUP_MSG', groupId: 'grp-int' }),
            undefined,
            expect.any(String)
        );
    });

    it('no pierde mensajes al cambiar el grupo a varios miembros offline', async () => {
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');

        const members = ['self-id'];
        contactStatuses['self-id'] = { status: 'connected', publicKey: '11'.repeat(32) };
        for (let i = 0; i < 25; i += 1) {
            const id = `off-${i}`;
            members.push(id);
            contactStatuses[id] = { status: 'disconnected', publicKey: 'cc'.repeat(32), address: `200::off-${i}` };
        }

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-off',
            name: 'Grupo offline',
            status: 'active',
            members,
            epoch: 3,
            senderKey: 'dd'.repeat(32),
        } as never);

        await sendGroupMessage('grp-off', 'mensaje offline');

        expect(transport.sendSecureUDPMessage).not.toHaveBeenCalled();
        expect(VaultManager.replicateToVaults).toHaveBeenCalledTimes(26);
    });
});
