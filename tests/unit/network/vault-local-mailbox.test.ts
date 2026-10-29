import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as vaultOps from '../../../src/main_process/storage/vault/operations.js';
import * as handlers from '../../../src/main_process/network/handlers/vault.js';
import { drainLocalMailbox } from '../../../src/main_process/network/vault/localMailbox.js';

const MY_ID = 'a1'.repeat(32);

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'a1'.repeat(32)),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    debug: vi.fn(),
    warn: vi.fn(),
}));

vi.mock('../../../src/main_process/network/vault/deviceMailbox.js', () => ({
    getMyMailboxDeviceId: vi.fn(async () => 'b2'.repeat(32)),
}));

vi.mock('../../../src/main_process/storage/vault/operations.js', () => ({
    getVaultEntriesPageForRecipient: vi.fn(),
    deleteVaultEntry: vi.fn(),
}));

vi.mock('../../../src/main_process/network/handlers/vault.js', () => ({
    handleVaultDelivery: vi.fn(),
}));

type Row = { id: number; payloadHash: string; data: string; senderSid: string };

const rows: Row[] = [
    { id: 1, payloadHash: 'h1', data: 'aa', senderSid: MY_ID },
    { id: 2, payloadHash: 'h2', data: 'bb', senderSid: MY_ID },
];

const ackAll = async (_sender: string, _data: unknown, _win: unknown, sendResponse: (address: string, packet: Record<string, unknown>) => void) => {
    sendResponse('local', { type: 'VAULT_ACK', payloadHashes: ['h1', 'h2'] });
};

describe('buzón local del vault', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(vaultOps.deleteVaultEntry).mockResolvedValue(true);
    });

    it('no hace nada si la custodia local está vacía', async () => {
        vi.mocked(vaultOps.getVaultEntriesPageForRecipient).mockResolvedValue([]);
        vi.mocked(handlers.handleVaultDelivery).mockResolvedValue(undefined);

        await expect(drainLocalMailbox()).resolves.toBe(0);
        expect(handlers.handleVaultDelivery).not.toHaveBeenCalled();
        expect(vaultOps.deleteVaultEntry).not.toHaveBeenCalled();
    });

    it('entrega las entradas que se confirman y las borra de la custodia', async () => {
        vi.mocked(vaultOps.getVaultEntriesPageForRecipient).mockResolvedValueOnce(rows as never).mockResolvedValue([]);
        vi.mocked(handlers.handleVaultDelivery).mockImplementation(ackAll as never);

        await expect(drainLocalMailbox()).resolves.toBe(2);

        expect(handlers.handleVaultDelivery).toHaveBeenCalledWith(
            MY_ID,
            expect.objectContaining({ entries: rows, hasMore: false }),
            null,
            expect.any(Function),
            'local-mailbox',
        );
        expect(vaultOps.getVaultEntriesPageForRecipient).toHaveBeenNthCalledWith(1, MY_ID, undefined, 120, 'b2'.repeat(32));
        expect(vaultOps.deleteVaultEntry).toHaveBeenCalledWith('h1');
        expect(vaultOps.deleteVaultEntry).toHaveBeenCalledWith('h2');
    });

    it('conserva las entradas que no se confirman para un intento posterior', async () => {
        vi.mocked(vaultOps.getVaultEntriesPageForRecipient).mockResolvedValueOnce(rows as never).mockResolvedValue([]);
        vi.mocked(handlers.handleVaultDelivery).mockResolvedValue(undefined);

        await expect(drainLocalMailbox()).resolves.toBe(0);
        expect(vaultOps.deleteVaultEntry).not.toHaveBeenCalled();
    });

    it('recorre las páginas siguientes sin repetir la anterior', async () => {
        const nextPage: Row[] = [{ id: 3, payloadHash: 'h3', data: 'cc', senderSid: MY_ID }];
        vi.mocked(vaultOps.getVaultEntriesPageForRecipient)
            .mockResolvedValueOnce(rows as never)
            .mockResolvedValueOnce(nextPage as never)
            .mockResolvedValue([]);
        vi.mocked(handlers.handleVaultDelivery).mockImplementation((async (
            _sender: string,
            data: { entries: Row[] },
            _win: unknown,
            sendResponse: (address: string, packet: Record<string, unknown>) => void,
        ) => {
            sendResponse('local', { type: 'VAULT_ACK', payloadHashes: data.entries.map((entry) => entry.payloadHash) });
        }) as never);

        await expect(drainLocalMailbox()).resolves.toBe(3);
        expect(vaultOps.getVaultEntriesPageForRecipient).toHaveBeenNthCalledWith(2, MY_ID, 2, 120, 'b2'.repeat(32));
        expect(vaultOps.getVaultEntriesPageForRecipient).toHaveBeenNthCalledWith(3, MY_ID, 3, 120, 'b2'.repeat(32));
    });

    it('no se queda en bucle si el custodio local falla', async () => {
        vi.mocked(vaultOps.getVaultEntriesPageForRecipient).mockResolvedValue(rows as never);
        vi.mocked(handlers.handleVaultDelivery).mockRejectedValue(new Error('boom'));

        await expect(drainLocalMailbox()).resolves.toBe(0);
        expect(vaultOps.getVaultEntriesPageForRecipient).toHaveBeenCalledTimes(1);
    });
});
