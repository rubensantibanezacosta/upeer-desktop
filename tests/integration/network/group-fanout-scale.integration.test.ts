import { beforeEach, describe, expect, it, vi } from 'vitest';

const SCALES = [1, 2, 3, 10, 20, 50, 100];

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

describe('group fan-out por escala de peers', () => {
    const buildGroup = (members: string[], epoch: number) => ({
        groupId: 'grp-scale',
        name: 'Grupo escala',
        status: 'active',
        members,
        epoch,
        senderKey: 'cc'.repeat(32),
    });

    beforeEach(() => {
        Object.keys(contactStatuses).forEach((key) => delete contactStatuses[key]);
        contactStatuses['self-id'] = { status: 'connected', publicKey: '11'.repeat(32) };
        vi.clearAllMocks();
    });

    it.each(SCALES)('entrega por UDP a todos los %d peers online y solo vaultea self', async (onlineCount) => {
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');

        const members = ['self-id'];
        for (let i = 0; i < onlineCount; i += 1) {
            const id = `peer-on-${i}`;
            members.push(id);
            contactStatuses[id] = { status: 'connected', publicKey: 'aa'.repeat(32), address: `200::on-${i}` };
        }

        vi.mocked(groupsOps.getGroupById).mockReturnValue(buildGroup(members, 5) as never);

        await sendGroupMessage('grp-scale', 'mensaje online');

        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(onlineCount);
        expect(VaultManager.replicateToVaults).toHaveBeenCalledTimes(1);
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith('self-id', expect.any(Object), undefined, expect.any(String));
    });


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

    it.each(SCALES)('vaultea a todos los %d peers offline además de self', async (offlineCount) => {
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');

        const members = ['self-id'];
        for (let i = 0; i < offlineCount; i += 1) {
            const id = `peer-off-${i}`;
            members.push(id);
            contactStatuses[id] = { status: 'disconnected', publicKey: 'bb'.repeat(32), address: `200::off-${i}` };
        }

        vi.mocked(groupsOps.getGroupById).mockReturnValue(buildGroup(members, 3) as never);

        await sendGroupMessage('grp-scale', 'mensaje offline');

        expect(transport.sendSecureUDPMessage).not.toHaveBeenCalled();
        expect(VaultManager.replicateToVaults).toHaveBeenCalledTimes(offlineCount + 1);
        for (const member of members) {
            expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(member, expect.any(Object), undefined, expect.any(String));
        }
    });

    it.each(SCALES)('entrega online y vaultea offline con %d peers en un grupo mixto', async (peerCount) => {
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');

        const members = ['self-id'];
        const online = Math.floor(peerCount / 2);
        const offline = peerCount - online;
        for (let i = 0; i < online; i += 1) {
            const id = `mix-on-${i}`;
            members.push(id);
            contactStatuses[id] = { status: 'connected', publicKey: 'aa'.repeat(32), address: `200::mix-on-${i}` };
        }
        for (let i = 0; i < offline; i += 1) {
            const id = `mix-off-${i}`;
            members.push(id);
            contactStatuses[id] = { status: 'disconnected', publicKey: 'bb'.repeat(32), address: `200::mix-off-${i}` };
        }

        vi.mocked(groupsOps.getGroupById).mockReturnValue(buildGroup(members, 9) as never);

        await sendGroupMessage('grp-scale', 'mensaje mixto');

        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(online);
        expect(VaultManager.replicateToVaults).toHaveBeenCalledTimes(offline + 1);
        for (let i = 0; i < offline; i += 1) {
            expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(`mix-off-${i}`, expect.any(Object), undefined, expect.any(String));
        }
    });
});

