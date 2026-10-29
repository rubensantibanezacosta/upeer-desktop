import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as contactsOpsModule from '../../../src/main_process/storage/contacts/operations.js';
import * as messagesOpsModule from '../../../src/main_process/storage/messages/operations.js';

type ContactRecord = NonNullable<Awaited<ReturnType<typeof contactsOpsModule.getContactByUpeerId>>>;
type SaveMessageResult = Awaited<ReturnType<typeof messagesOpsModule.saveMessage>>;

const ACCOUNT = 'a1'.repeat(32);

vi.mock('../../../src/main_process/network/contactAdmission.js', () => {
    class ContactAdmissionError extends Error {
        readonly reason: string;

        constructor(reason: string) {
            super(`contact admission rejected: ${reason}`);
            this.name = 'ContactAdmissionError';
            this.reason = reason;
        }
    }

    return {
        ContactAdmissionError,
        requireContactAdmission: vi.fn(async (upeerId: string) => {
            if (upeerId === 'a1'.repeat(32)) throw new ContactAdmissionError('account registry is unavailable');
        }),
        resetContactAdmissionCache: vi.fn(),
    };
});

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
    getContacts: vi.fn(() => []),
}));

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    getGroupById: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveMessage: vi.fn(),
    updateMessageStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/status.js', () => ({
    getMessageStatus: vi.fn(() => 'sent'),
}));

vi.mock('../../../src/main_process/storage/ratchet/operations.js', () => ({
    getRatchetSession: vi.fn(() => null),
    saveRatchetSession: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyPublicKeyHex: vi.fn(() => '11'.repeat(32)),
    getMyUPeerId: vi.fn(() => 'self-id'),
    sign: vi.fn(() => Buffer.from('sig')),
    getMyIdentitySkBuffer: vi.fn(() => Buffer.alloc(32)),
    getMySignedPreKey: vi.fn(() => ({ spkPub: '55'.repeat(32), spkSig: '66'.repeat(64), spkId: 13 })),
    getMyPublicKey: vi.fn(() => Buffer.from('11'.repeat(32), 'hex')),
}));

vi.mock('../../../src/main_process/security/deviceMessaging.js', () => ({
    signWithDevice: vi.fn(() => Buffer.from('device-sig')),
}));

vi.mock('../../../src/main_process/security/ratchet.js', () => ({
    x3dhInitiator: vi.fn(() => ({
        ekPub: Buffer.from('33'.repeat(32), 'hex'),
        sharedSecret: Buffer.alloc(32, 7),
    })),
    ratchetInitAlice: vi.fn(() => ({ rk: Buffer.alloc(32) })),
    ratchetEncrypt: vi.fn(() => ({
        header: { dh: '44'.repeat(32), pn: 0, n: 0 },
        ciphertext: 'ratchet-cipher',
        nonce: 'ratchet-nonce',
    })),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
}));

vi.mock('../../../src/main_process/network/utils.js', () => ({
    canonicalStringify: vi.fn((data) => JSON.stringify(data)),
}));

vi.mock('../../../src/main_process/network/server/transport.js', () => ({
    sendSecurePacket: vi.fn(),
}));

vi.mock('../../../src/main_process/network/dht/core.js', () => ({
    startDhtSearch: vi.fn(),
}));

vi.mock('../../../src/main_process/network/og-fetcher.js', () => ({
    fetchOgPreview: vi.fn(),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        replicateToVaults: vi.fn(),
    },
}));

vi.mock('electron', () => ({
    BrowserWindow: {
        getAllWindows: vi.fn(() => [{ webContents: { send: vi.fn() } }]),
    },
}));

describe('envío con la admisión de contacto caída', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('deja el mensaje en custodia en vez de devolver un fallo al remitente', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendChatMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: ACCOUNT,
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 7,
            address: '200::9',
            knownAddresses: '[]',
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(messagesOps.updateMessageStatus).mockResolvedValue(true);
        vi.mocked(VaultManager.replicateToVaults).mockResolvedValue(1);

        const result = await sendChatMessage(ACCOUNT, 'hola sin registro');

        expect(result).toEqual(expect.objectContaining({ savedMessage: 'hola sin registro' }));
        expect(messagesOps.saveMessage).toHaveBeenCalledWith(
            expect.any(String),
            ACCOUNT,
            true,
            'hola sin registro',
            undefined,
            '',
            'sent',
            'self-id',
            expect.any(Number),
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            ACCOUNT,
            expect.objectContaining({ type: 'CHAT', senderUpeerId: 'self-id' }),
        );
        expect(messagesOps.updateMessageStatus).toHaveBeenCalledWith(expect.any(String), 'vaulted');
        expect(messagesOps.updateMessageStatus).not.toHaveBeenCalledWith(expect.any(String), 'failed');
    });

    it('un contacto desconectado tampoco pasa por la admisión', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { requireContactAdmission } = await import('../../../src/main_process/network/contactAdmission.js');
        const { sendChatMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: ACCOUNT,
            status: 'offline',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 7,
            address: '',
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(messagesOps.updateMessageStatus).mockResolvedValue(true);
        vi.mocked(VaultManager.replicateToVaults).mockResolvedValue(2);

        const result = await sendChatMessage(ACCOUNT, 'hola apagado');

        expect(result).toEqual(expect.objectContaining({ savedMessage: 'hola apagado' }));
        expect(requireContactAdmission).not.toHaveBeenCalled();
        expect(VaultManager.replicateToVaults).toHaveBeenCalled();
        expect(messagesOps.updateMessageStatus).toHaveBeenCalledWith(expect.any(String), 'vaulted');
    });

    it('si la custodia también falla, el mensaje se marca como fallido', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');
        const { sendChatMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: ACCOUNT,
            status: 'offline',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 7,
            address: '',
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(messagesOps.updateMessageStatus).mockResolvedValue(true);
        vi.mocked(VaultManager.replicateToVaults).mockRejectedValue(new Error('sin custodios'));

        await sendChatMessage(ACCOUNT, 'hola sin nadie');

        expect(messagesOps.updateMessageStatus).toHaveBeenCalledWith(expect.any(String), 'failed');
    });
});
