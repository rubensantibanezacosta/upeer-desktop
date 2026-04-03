import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContacts: vi.fn(() => []),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    deleteMessagesByChatId: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'self-id'),
    getMyPublicKey: vi.fn(() => Buffer.from('11'.repeat(32), 'hex')),
    sign: vi.fn(() => Buffer.from('sig')),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
    error: vi.fn(),
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

describe('chatMutations sendChatClear edge cases', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('fan-out a dispositivos propios y replica sólo a self más tres peers de confianza', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const dhtHandlers = await import('../../../src/main_process/network/dht/handlers.js');
        const transport = await import('../../../src/main_process/network/server/transport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendChatClear } = await import('../../../src/main_process/network/messaging/chatMutations.js');

        vi.mocked(contactsOps.getContacts).mockReturnValue([
            { upeerId: 'self-id', status: 'connected' },
            { upeerId: 'friend-1', status: 'connected' },
            { upeerId: 'friend-2', status: 'connected' },
            { upeerId: 'friend-3', status: 'connected' },
            { upeerId: 'friend-4', status: 'connected' },
        ] as never);
        vi.mocked(dhtHandlers.getKademliaInstance).mockReturnValue({
            findClosestContacts: vi.fn(() => [
                { upeerId: 'self-id', address: '200::tablet' },
                { upeerId: 'self-id', address: '200::laptop' },
                { upeerId: 'other-id', address: '200::other' },
                { upeerId: 'self-id', address: '200::self' },
            ]),
        } as never);

        await sendChatClear('peer-target', 123456);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(transport.sendSecureUDPMessage).toHaveBeenCalledTimes(2);
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith('200::tablet', {
            type: 'CHAT_CLEAR_ALL',
            chatUpeerId: 'peer-target',
            timestamp: 123456,
        }, '11'.repeat(32));
        expect(transport.sendSecureUDPMessage).toHaveBeenCalledWith('200::laptop', {
            type: 'CHAT_CLEAR_ALL',
            chatUpeerId: 'peer-target',
            timestamp: 123456,
        }, '11'.repeat(32));
        expect(messagesOps.deleteMessagesByChatId).toHaveBeenCalledWith('peer-target', 123456);
        expect(VaultManager.replicateToVaults).toHaveBeenNthCalledWith(1, 'self-id', expect.objectContaining({
            type: 'CHAT_CLEAR_ALL',
            chatUpeerId: 'peer-target',
            timestamp: 123456,
            senderUpeerId: 'self-id',
            signature: Buffer.from('sig').toString('hex'),
        }));
        expect(VaultManager.replicateToVaults).toHaveBeenNthCalledWith(2, 'friend-1', expect.any(Object));
        expect(VaultManager.replicateToVaults).toHaveBeenNthCalledWith(3, 'friend-2', expect.any(Object));
        expect(VaultManager.replicateToVaults).toHaveBeenNthCalledWith(4, 'friend-3', expect.any(Object));
        expect(VaultManager.replicateToVaults).toHaveBeenCalledTimes(4);
    });

    it('si falla el descubrimiento DHT, avisa y sigue limpiando/replicando', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const dhtHandlers = await import('../../../src/main_process/network/dht/handlers.js');
        const logger = await import('../../../src/main_process/security/secure-logger.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendChatClear } = await import('../../../src/main_process/network/messaging/chatMutations.js');

        vi.mocked(contactsOps.getContacts).mockReturnValue([{ upeerId: 'friend-1', status: 'connected' }] as never);
        vi.mocked(dhtHandlers.getKademliaInstance).mockImplementation(() => {
            throw new Error('dht-offline');
        });

        await sendChatClear('peer-target', 222);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(logger.warn).toHaveBeenCalledWith(
            'Failed to fan-out CHAT_CLEAR_ALL to other own devices',
            expect.objectContaining({ upeerId: 'peer-target', err: 'Error: dht-offline' }),
            'network'
        );
        expect(messagesOps.deleteMessagesByChatId).toHaveBeenCalledWith('peer-target', 222);
        expect(VaultManager.replicateToVaults).toHaveBeenCalledTimes(2);
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith('self-id', expect.objectContaining({ type: 'CHAT_CLEAR_ALL' }));
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith('friend-1', expect.objectContaining({ type: 'CHAT_CLEAR_ALL' }));
    });
});
