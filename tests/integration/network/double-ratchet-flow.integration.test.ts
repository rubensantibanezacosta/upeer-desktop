import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RatchetHeader, X3DHInitPacket } from '../../../src/main_process/security/ratchetShared.js';

type Role = 'alice' | 'bob';
type SessionRecord = { state: unknown; spkIdUsed?: number | null };

const ratchetStores: Record<Role, Map<string, SessionRecord>> = {
    alice: new Map(),
    bob: new Map(),
};

const identities = {
    alice: {
        publicKeyHex: '11'.repeat(32),
        secretKey: Buffer.alloc(32, 1),
    },
    bob: {
        publicKeyHex: '22'.repeat(32),
        secretKey: Buffer.alloc(32, 2),
        spkPk: Buffer.alloc(32, 9),
        spkSk: Buffer.alloc(32, 10),
        spkId: 99,
    },
};

let currentRole: Role = 'alice';

const setRole = (role: Role) => {
    currentRole = role;
};

const normalizeX3dhInit = (value: { ekPub: string; ikPub: string; spkId: number | null | undefined } | undefined): X3DHInitPacket | undefined => {
    if (!value || typeof value.spkId !== 'number') {
        return undefined;
    }
    return {
        ekPub: value.ekPub,
        ikPub: value.ikPub,
        spkId: value.spkId,
    };
};

const toDecryptPayload = (packet: {
    content: string;
    nonce: string;
    ratchetHeader?: RatchetHeader;
    x3dhInit?: { ekPub: string; ikPub: string; spkId: number | null | undefined };
}) => {
    const x3dhInit = normalizeX3dhInit(packet.x3dhInit);
    return {
        content: packet.content,
        nonce: packet.nonce,
        ratchetHeader: packet.ratchetHeader,
        ...(x3dhInit ? { x3dhInit } : {}),
    };
};

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyIdentitySkBuffer: vi.fn(() => identities[currentRole].secretKey),
    getMyPublicKeyHex: vi.fn(() => identities[currentRole].publicKeyHex),
    getSpkBySpkId: vi.fn((spkId: number) => {
        if (currentRole === 'bob' && spkId === identities.bob.spkId) {
            return { spkPk: identities.bob.spkPk, spkSk: identities.bob.spkSk };
        }
        return null;
    }),
    sign: vi.fn(() => Buffer.from('sig')),
}));

vi.mock('../../../src/main_process/storage/ratchet/operations.js', () => ({
    getRatchetSession: vi.fn((upeerId: string) => ratchetStores[currentRole].get(upeerId) ?? null),
    saveRatchetSession: vi.fn((upeerId: string, state: unknown, spkIdUsed?: number | null) => {
        ratchetStores[currentRole].set(upeerId, { state, spkIdUsed });
    }),
    deleteRatchetSession: vi.fn((upeerId: string) => {
        ratchetStores[currentRole].delete(upeerId);
    }),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        replicateToVaults: vi.fn(async () => 1),
    },
}));

describe('Double Ratchet flow integration', () => {
    beforeEach(() => {
        ratchetStores.alice.clear();
        ratchetStores.bob.clear();
        setRole('alice');
        vi.clearAllMocks();
    });

    it('completes an X3DH bootstrap and then reuses the saved DR session', async () => {
        const { encryptChatPayload } = await import('../../../src/main_process/network/messaging/chatEncryption.js');
        const { decryptDoubleRatchetPayload } = await import('../../../src/main_process/network/handlers/doubleRatchetDecrypt.js');

        setRole('alice');
        const firstPacket = await encryptChatPayload('bob-peer', 'hola bob', {
            publicKey: identities.bob.publicKeyHex,
            signedPreKey: identities.bob.spkPk.toString('hex'),
            signedPreKeyId: identities.bob.spkId,
        });
        const firstDecryptPayload = toDecryptPayload(firstPacket);

        expect(firstPacket.ratchetHeader).toBeDefined();
        expect(firstPacket.x3dhInit).toEqual({
            ekPub: expect.any(String),
            spkId: identities.bob.spkId,
            ikPub: identities.alice.publicKeyHex,
        });
        expect(ratchetStores.alice.get('bob-peer')).toBeDefined();

        setRole('bob');
        const firstPlaintext = await decryptDoubleRatchetPayload('alice-peer', firstDecryptPayload);

        expect(firstPlaintext).toBe('hola bob');
        expect(ratchetStores.bob.get('alice-peer')).toBeDefined();

        setRole('alice');
        const secondPacket = await encryptChatPayload('bob-peer', 'segundo mensaje', {
            publicKey: identities.bob.publicKeyHex,
            signedPreKey: identities.bob.spkPk.toString('hex'),
            signedPreKeyId: identities.bob.spkId,
        });
        const secondDecryptPayload = toDecryptPayload(secondPacket);

        expect(secondPacket.ratchetHeader).toBeDefined();
        expect(secondPacket.x3dhInit).toBeUndefined();

        setRole('bob');
        const secondPlaintext = await decryptDoubleRatchetPayload('alice-peer', secondDecryptPayload);

        expect(secondPlaintext).toBe('segundo mensaje');
    });

    it('vaults offline chat packets with DR metadata and without legacy fields', async () => {
        const { vaultChatForOfflineDelivery } = await import('../../../src/main_process/network/messaging/chatSupport.js');
        const { VaultManager } = await import('../../../src/main_process/network/vault/manager.js');

        setRole('alice');
        const replicated = await vaultChatForOfflineDelivery(
            'bob-peer',
            {
                publicKey: identities.bob.publicKeyHex,
                signedPreKey: identities.bob.spkPk.toString('hex'),
                signedPreKeyId: identities.bob.spkId,
            },
            'msg-1',
            'hola offline',
            undefined,
            'alice-peer',
            123456,
        );

        expect(replicated).toBe(1);
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'bob-peer',
            expect.objectContaining({
                type: 'CHAT',
                id: 'msg-1',
                content: expect.any(String),
                nonce: expect.any(String),
                ratchetHeader: expect.any(Object),
                x3dhInit: expect.objectContaining({ spkId: identities.bob.spkId }),
                senderUpeerId: 'alice-peer',
                signature: Buffer.from('sig').toString('hex'),
            }),
        );
        expect(VaultManager.replicateToVaults).toHaveBeenCalledWith(
            'bob-peer',
            expect.not.objectContaining({
                ephemeralPublicKey: expect.anything(),
                useRecipientEphemeral: expect.anything(),
            }),
        );
    });
});
