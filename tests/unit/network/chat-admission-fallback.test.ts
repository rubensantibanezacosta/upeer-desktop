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
        requireContactAdmission: vi.fn(async (upeerId: string, _publicKey?: unknown, options?: { policy?: string }) => {
            // Con 'allow-with-audit' el hueco de registro se admite y la entrega sigue;
            // solo vetamos cuando la política es la estricta por defecto.
            if (options?.policy === 'allow-with-audit') return;
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

    it('entrega con auditoría cuando el registro de cuenta no está disponible', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { requireContactAdmission } = await import('../../../src/main_process/network/contactAdmission.js');
        const { sendSecurePacket } = await import('../../../src/main_process/network/server/transport.js');
        const { sendChatMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: ACCOUNT,
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 7,
            address: '200:3e61:590f:2529:4204:63ea:4676:e43f',
            knownAddresses: '[]',
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(messagesOps.updateMessageStatus).mockResolvedValue(true);

        await sendChatMessage(ACCOUNT, 'hola conectado sin registro');

        // El envío directo no veta: pide la política auditada, igual que hace el móvil.
        expect(requireContactAdmission).toHaveBeenCalledWith(
            ACCOUNT,
            expect.any(String),
            expect.objectContaining({ policy: 'allow-with-audit' }),
        );
        // Y el paquete sale hacia la dirección real del contacto en vez de quedarse en el vault.
        expect(sendSecurePacket).toHaveBeenCalledWith(
            '200:3e61:590f:2529:4204:63ea:4676:e43f',
            expect.objectContaining({ type: 'CHAT' }),
            expect.anything(),
            false,
        );
        expect(messagesOps.updateMessageStatus).not.toHaveBeenCalledWith(expect.any(String), 'vaulted');
    });

    it('entrega en vez de dejar en custodia cuando la admisión veta con la política estricta', async () => {
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const messagesOps = await import('../../../src/main_process/storage/messages/operations.js');
        const { sendSecurePacket } = await import('../../../src/main_process/network/server/transport.js');
        const { sendChatMessage } = await import('../../../src/main_process/network/messaging/chat.js');

        vi.mocked(getContactByUpeerId).mockResolvedValue({
            upeerId: ACCOUNT,
            status: 'connected',
            publicKey: 'aa'.repeat(32),
            signedPreKey: 'bb'.repeat(32),
            signedPreKeyId: 7,
            address: '200:3e61:590f:2529:4204:63ea:4676:e43f',
            knownAddresses: '[]',
        } as unknown as ContactRecord);
        vi.mocked(messagesOps.saveMessage).mockResolvedValue({ changes: 1 } as SaveMessageResult);
        vi.mocked(messagesOps.updateMessageStatus).mockResolvedValue(true);

        await sendChatMessage(ACCOUNT, 'hola sin registro');

        // El envío directo siempre pide la política auditada, así que el paquete sale
        // aunque la admisión estricta habría vetado este caso.
        expect(sendSecurePacket).toHaveBeenCalledWith(
            '200:3e61:590f:2529:4204:63ea:4676:e43f',
            expect.objectContaining({ type: 'CHAT' }),
            expect.anything(),
            false,
        );
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
