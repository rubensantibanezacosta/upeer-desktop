/* eslint-disable no-console */
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

describe('escalabilidad de mensajería (grupos, chats, multimedia, vault)', () => {
    const SIZES = [2, 5, 10, 50, 100];

    beforeEach(() => {
        Object.keys(contactStatuses).forEach((key) => delete contactStatuses[key]);
        vi.clearAllMocks();
    });

    it('grupo/chat: fan-out de un mensaje a N miembros online (subida O(N))', async () => {
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');

        for (const N of SIZES) {
            const members = ['self-id'];
            contactStatuses['self-id'] = { status: 'connected', publicKey: '11'.repeat(32) };
            for (let i = 0; i < N - 1; i += 1) {
                const id = `peer-${N}-${i}`;
                members.push(id);
                contactStatuses[id] = { status: 'connected', publicKey: 'aa'.repeat(32), address: `200::${id}` };
            }
            vi.mocked(groupsOps.getGroupById).mockReturnValue({
                groupId: `g-${N}`,
                name: 'Grupo',
                status: 'active',
                members,
                epoch: 1,
                senderKey: 'cc'.repeat(32),
            } as never);

            vi.mocked(transport.sendSecureUDPMessage).mockClear();
            await sendGroupMessage(`g-${N}`, 'hola');
            const sent = vi.mocked(transport.sendSecureUDPMessage).mock.calls.length;
            expect(sent).toBe(N - 1);
            console.log(`  grupo N=${N}: ${sent} envíos de fan-out`);
        }
    });

    it('vault: replica el payload a cada nodo offline (lineal en N offline)', async () => {
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');

        for (const N of [2, 5, 10, 50]) {
            const members = ['self-id'];
            contactStatuses['self-id'] = { status: 'connected', publicKey: '11'.repeat(32) };
            const offlineCount = N;
            for (let i = 0; i < offlineCount; i += 1) {
                const id = `off-${N}-${i}`;
                members.push(id);
                contactStatuses[id] = { status: 'disconnected', publicKey: 'bb'.repeat(32), address: `200::${id}` };
            }
            vi.mocked(groupsOps.getGroupById).mockReturnValue({
                groupId: `gv-${N}`,
                name: 'Grupo',
                status: 'active',
                members,
                epoch: 1,
                senderKey: 'dd'.repeat(32),
            } as never);

            vi.mocked(VaultManager.replicateToVaults).mockClear();
            await sendGroupMessage(`gv-${N}`, 'vaultear');
            const replications = vi.mocked(VaultManager.replicateToVaults).mock.calls.length;
            expect(replications).toBeGreaterThanOrEqual(offlineCount);
            expect(replications).toBeLessThanOrEqual(offlineCount * 4);
            console.log(`  vault N=${N} offline: ${replications} replicaciones`);
        }
    });

    it('multimedia: el chunking de un archivo crece linealmente con su tamaño', async () => {
        const { FileChunker } = await import('../../../src/main_process/network/file-transfer/chunker.js');
        const chunker = new FileChunker(65536);
        const sizesMB = [1, 10, 100, 1024];
        const chunkCounts: number[] = [];
        for (const mb of sizesMB) {
            const size = mb * 1024 * 1024;
            const chunks = chunker.calculateChunks(size, 65536);
            chunkCounts.push(chunks);
            expect(chunks).toBe(Math.ceil(size / 65536));
            console.log(`  multimedia ${mb}MB: ${chunks} chunks`);
        }
        for (let i = 1; i < chunkCounts.length; i += 1) {
            const ratio = chunkCounts[i] / chunkCounts[i - 1];
            expect(ratio).toBeGreaterThanOrEqual(9.5);
            expect(ratio).toBeLessThanOrEqual(10.5);
        }
    });
});

