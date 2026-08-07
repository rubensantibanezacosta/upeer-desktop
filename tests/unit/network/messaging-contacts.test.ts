import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyPublicKeyHex: vi.fn(() => '11'.repeat(32)),
    getMyEphemeralPublicKeyHex: vi.fn(() => '22'.repeat(32)),
    getMyUPeerId: vi.fn(() => 'self-id'),
    getMyAlias: vi.fn(() => 'Alice'),
    getMyAvatar: vi.fn(() => 'avatar-b64'),
    getMySignedPreKeyBundle: vi.fn(() => ({
        spkPub: '33'.repeat(32),
        spkSig: '44'.repeat(64),
        spkId: 7,
        ikPub: '11'.repeat(32),
    })),
}));

vi.mock('../../../src/main_process/security/pow.js', () => ({
    AdaptivePow: {
        generateLightProof: vi.fn(() => ({ difficulty: 3, nonce: 'abc' })),
    },
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/keys.js', () => ({
    updateContactPublicKey: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/status.js', () => ({
    updateContactStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecureUDPMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/core/windowManager.js', () => ({
    getMainWindow: vi.fn(),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        queryOwnVaults: vi.fn().mockResolvedValue(undefined),
    },
}));

describe('network/messaging/contacts.ts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sendContactRequest envía un HANDSHAKE_REQ con PoW, claves y alias', async () => {
        const identity = await import('../../../src/main_process/security/identity.js');
        const pow = await import('../../../src/main_process/security/pow.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const { sendContactRequest } = await import('../../../src/main_process/network/messaging/contacts.js');

        await sendContactRequest('200::target');

        expect(pow.AdaptivePow.generateLightProof).toHaveBeenCalledWith('self-id');
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::target',
            expect.objectContaining({
                type: 'HANDSHAKE_REQ',
                publicKey: '11'.repeat(32),
                signedPreKey: expect.objectContaining({ spkId: 7 }),
                alias: 'Alice',
                avatar: 'avatar-b64',
                powProof: expect.objectContaining({ difficulty: 3 }),
            })
        );
        expect(identity.getMyAlias).toHaveBeenCalled();
    });

    it('acceptContactRequest no hace nada si el contacto no existe', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue(undefined);

        const keys = await import('../../../src/main_process/storage/contacts/keys.js');
        const { acceptContactRequest } = await import('../../../src/main_process/network/messaging/contacts.js');

        await acceptContactRequest('peer-1', 'aa'.repeat(32));

        expect(keys.updateContactPublicKey).not.toHaveBeenCalled();
    });

    it('acceptContactRequest actualiza claves y estado, notifica y envía HANDSHAKE_ACCEPT', async () => {
        const contactsOps = await import('../../../src/main_process/storage/contacts/operations.js');
        const keys = await import('../../../src/main_process/storage/contacts/keys.js');
        const status = await import('../../../src/main_process/storage/contacts/status.js');
        const { sendSecureUDPMessage } = await import('../../../src/main_process/network/server/transport.js');
        const wm = await import('../../../src/main_process/core/windowManager.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');

        vi.mocked(contactsOps.getContactByUpeerId).mockResolvedValue({
            upeerId: 'peer-1',
            address: '200::peer',
        } as never);

        const sendMock = vi.fn();
        vi.mocked(wm.getMainWindow).mockReturnValue({ webContents: { send: sendMock } } as never);

        const { acceptContactRequest } = await import('../../../src/main_process/network/messaging/contacts.js');
        await acceptContactRequest('peer-1', 'aa'.repeat(32));

        expect(keys.updateContactPublicKey).toHaveBeenCalledWith('peer-1', 'aa'.repeat(32));
        expect(status.updateContactStatus).toHaveBeenCalledWith('peer-1', 'connected');
        expect(sendMock).toHaveBeenCalledWith('contact-handshake-finished', { upeerId: 'peer-1' });
        expect(sendSecureUDPMessage).toHaveBeenCalledWith(
            '200::peer',
            expect.objectContaining({ type: 'HANDSHAKE_ACCEPT' })
        );
        expect(VaultManager.queryOwnVaults).toHaveBeenCalled();
    });
});
