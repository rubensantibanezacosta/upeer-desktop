import { beforeEach, describe, expect, it, vi } from 'vitest';

const getRatchetSession = vi.fn();
const saveRatchetSession = vi.fn();
const x3dhInitiator = vi.fn(() => ({ ekPub: Buffer.from('33'.repeat(32), 'hex'), sharedSecret: Buffer.alloc(32, 7) }));
const ratchetInitAlice = vi.fn(() => ({ rk: Buffer.alloc(32) }));
const ratchetEncrypt = vi.fn(() => ({
    header: { dh: '44'.repeat(32), pn: 0, n: 0 },
    ciphertext: 'cipher',
    nonce: 'nonce',
}));

vi.mock('../../../src/main_process/storage/ratchet/operations.js', () => ({
    getRatchetSession: (...args: unknown[]) => getRatchetSession(...(args as [])),
    saveRatchetSession: (...args: unknown[]) => saveRatchetSession(...(args as [])),
}));

vi.mock('../../../src/main_process/security/ratchet.js', () => ({
    x3dhInitiator: (...args: unknown[]) => x3dhInitiator(...(args as [])),
    ratchetInitAlice: (...args: unknown[]) => ratchetInitAlice(...(args as [])),
    ratchetEncrypt: (...args: unknown[]) => ratchetEncrypt(...(args as [])),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyIdentitySkBuffer: vi.fn(() => Buffer.alloc(32, 1)),
    getMyPublicKeyHex: vi.fn(() => '11'.repeat(32)),
}));

vi.mock('../../../src/main_process/security/deviceMessaging.js', () => ({
    getDeviceMessagingIdentity: vi.fn(() => ({
        identity: { publicKey: '22'.repeat(32), secretKey: Buffer.alloc(32, 2) },
    })),
}));

const ACCOUNT = 'a1'.repeat(32);
const DEVICE_A = 'aa'.repeat(32);
const DEVICE_B = 'bb'.repeat(32);

const contactFor = (deviceId: string) => ({
    publicKey: 'cc'.repeat(32),
    signedPreKey: 'dd'.repeat(32),
    signedPreKeyId: 7,
    deviceId,
    devicePublicKey: 'ee'.repeat(32),
    deviceSignedPreKey: 'ff'.repeat(32),
    deviceSignedPreKeyId: 9,
});

describe('contexto del ratchet al cifrar un chat directo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getRatchetSession.mockReturnValue(null);
    });

    it('usa una sesión distinta por dispositivo de la misma cuenta', async () => {
        // Es el arreglo del multi-dispositivo: con una sola sesión por cuenta, dos
        // dispositivos del mismo contacto se pisaban el ratchet y uno dejaba de descifrar.
        const { encryptChatPayload } = await import('../../../src/main_process/network/messaging/chatEncryption.js');

        await encryptChatPayload(ACCOUNT, 'hola', contactFor(DEVICE_A), 'direct', { allowDeviceIdentity: true });
        await encryptChatPayload(ACCOUNT, 'hola', contactFor(DEVICE_B), 'direct', { allowDeviceIdentity: true });

        const contexts = getRatchetSession.mock.calls.map(([, context]) => context);
        expect(contexts).toEqual([`direct:${DEVICE_A}`, `direct:${DEVICE_B}`]);

        const savedContexts = saveRatchetSession.mock.calls.map(([, , , context]) => context);
        expect(savedContexts).toEqual([`direct:${DEVICE_A}`, `direct:${DEVICE_B}`]);
    });

    it('mantiene el contexto histórico cuando el contacto no tiene dispositivo', async () => {
        const { encryptChatPayload } = await import('../../../src/main_process/network/messaging/chatEncryption.js');

        await encryptChatPayload(ACCOUNT, 'hola', {
            publicKey: 'cc'.repeat(32),
            signedPreKey: 'dd'.repeat(32),
            signedPreKeyId: 7,
        }, 'direct', { allowDeviceIdentity: true });

        expect(getRatchetSession).toHaveBeenCalledWith(ACCOUNT, 'direct');
    });

    it('no toca el contexto de grupos ni el de sync', async () => {
        const { encryptChatPayload } = await import('../../../src/main_process/network/messaging/chatEncryption.js');

        await encryptChatPayload('grp-abc', 'hola', contactFor(DEVICE_A), 'group:grp-abc');
        await encryptChatPayload('self-id', 'hola', contactFor(DEVICE_A), `sync:${DEVICE_A}`);

        const contexts = getRatchetSession.mock.calls.map(([, context]) => context);
        expect(contexts).toEqual(['group:grp-abc', `sync:${DEVICE_A}`]);
    });
});
