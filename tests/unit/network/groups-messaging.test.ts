import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    getGroupById: vi.fn(),
    saveGroup: vi.fn(),
    updateGroupMembers: vi.fn(),
    updateGroupInfo: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'self-id'),
    sign: vi.fn(() => Buffer.from('sig')),
    encrypt: vi.fn(() => ({ ciphertext: 'ciphertext', nonce: 'nonce' })),
    getMyEphemeralPublicKeyHex: vi.fn(() => '22'.repeat(32)),
    incrementEphemeralMessageCounter: vi.fn(),
    getMyPublicKey: vi.fn(() => Buffer.from('11'.repeat(32), 'hex')),
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

vi.mock('../../../src/main_process/network/og-fetcher.js', () => ({
    fetchOgPreview: vi.fn(),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        replicateToVaults: vi.fn(),
    },
}));

describe('network/messaging/groups.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses static key for offline GROUP_UPDATE delivery', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const identity = await import('../../../src/main_process/security/identity.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { updateGroup } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-1',
            members: ['self-id', 'peer-offline'],
        } as any);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-offline',
            status: 'disconnected',
            publicKey: 'aa'.repeat(32),
            ephemeralPublicKey: 'bb'.repeat(32),
            ephemeralPublicKeyUpdatedAt: new Date().toISOString(),
        } as any);

        await updateGroup('grp-1', { name: 'Nuevo nombre' });

        expect(identity.encrypt).toHaveBeenCalledWith(
            Buffer.from(JSON.stringify({ groupName: 'Nuevo nombre' }), 'utf-8'),
            Buffer.from('aa'.repeat(32), 'hex')
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'peer-offline',
            expect.objectContaining({
                type: 'GROUP_UPDATE',
                useRecipientEphemeral: false,
                senderUpeerId: 'self-id'
            })
        );
    });

    it('uses recipient ephemeral key for online GROUP_UPDATE delivery', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const identity = await import('../../../src/main_process/security/identity.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { updateGroup } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-1',
            members: ['self-id', 'peer-online'],
        } as any);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            ephemeralPublicKey: 'bb'.repeat(32),
            ephemeralPublicKeyUpdatedAt: new Date().toISOString(),
            address: '200::10',
            knownAddresses: '[]'
        } as any);

        await updateGroup('grp-1', { name: 'Nuevo nombre' });

        expect(identity.encrypt).toHaveBeenCalledWith(
            Buffer.from(JSON.stringify({ groupName: 'Nuevo nombre' }), 'utf-8'),
            Buffer.from('bb'.repeat(32), 'hex')
        );
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::10',
            expect.objectContaining({
                type: 'GROUP_UPDATE',
                useRecipientEphemeral: true,
                ephemeralPublicKey: '22'.repeat(32)
            }),
            'aa'.repeat(32)
        );
    });

    it('serializes a provided link preview for group messages without refetching', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { fetchOgPreview } = await import('../../../src/main_process/network/og-fetcher.js');
        const { sendGroupMessage } = await import('../../../src/main_process/network/messaging/groups.js');

        vi.mocked(groupsOps.getGroupById).mockReturnValue({
            groupId: 'grp-1',
            name: 'Grupo',
            status: 'active',
            members: ['self-id', 'peer-online'],
        } as any);
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-online',
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            address: '200::10',
            knownAddresses: '[]'
        } as any);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as any);

        const preview = {
            url: 'https://example.com',
            title: 'Example',
            description: 'Preview',
            domain: 'example.com'
        };

        const result = await sendGroupMessage('grp-1', 'mira https://example.com', undefined, preview);

        expect(fetchOgPreview).not.toHaveBeenCalled();
        expect(result).toEqual(expect.objectContaining({
            savedMessage: JSON.stringify({ text: 'mira https://example.com', linkPreview: preview })
        }));
        expect(messagesOps.saveMessage).toHaveBeenCalledWith(
            expect.any(String),
            'grp-1',
            true,
            JSON.stringify({ text: 'mira https://example.com', linkPreview: preview }),
            undefined,
            expect.any(String),
            'sent',
            'self-id',
            expect.any(Number)
        );
    });
});
