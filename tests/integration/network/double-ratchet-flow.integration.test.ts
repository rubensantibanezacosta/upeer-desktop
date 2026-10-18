import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deserializeState, serializeState } from '../../../src/main_process/security/ratchetState.js';
import type { RatchetHeader, X3DHInitPacket } from '../../../src/main_process/security/ratchetShared.js';

type Role = 'alice' | 'bob';
type SessionRecord = { state: unknown; spkIdUsed?: number | null };

const ratchetStores: Record<Role, Map<string, SessionRecord>> = {
    alice: new Map(),
    bob: new Map(),
};
const messageStores = new Map<string, { id: string; chatUpeerId: string; message: string; isMine: number }>();

const identities = {
    alice: {
        publicKeyHex: '11'.repeat(32),
        secretKey: Buffer.alloc(32, 1),
        spkPk: Buffer.alloc(32, 7),
        spkSk: Buffer.alloc(32, 8),
        spkId: 98,
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
    getMyUPeerId: vi.fn(() => `${currentRole}-peer`),
    getMySignedPreKeyBundle: vi.fn(() => ({ spkPub: '33'.repeat(32), spkSig: '44'.repeat(64), spkId: identities[currentRole].spkId })),
    getMyPublicKeyHex: vi.fn(() => identities[currentRole].publicKeyHex),
    getSpkBySpkId: vi.fn((spkId: number) => {
        if (currentRole === 'bob' && spkId === identities.bob.spkId) {
            return { spkPk: identities.bob.spkPk, spkSk: identities.bob.spkSk };
        }
        if (currentRole === 'alice' && spkId === identities.alice.spkId) {
            return { spkPk: identities.alice.spkPk, spkSk: identities.alice.spkSk };
        }
        return null;
    }),
    sign: vi.fn(() => Buffer.from('sig')),
    verify: vi.fn(() => true),
}));

vi.mock('../../../src/main_process/storage/ratchet/operations.js', () => ({
    getRatchetSession: vi.fn((upeerId: string, contextId = 'direct') => {
        const record = ratchetStores[currentRole].get(`${contextId}:${upeerId}`);
        return record ? deserializeState(serializeState(record.state as never, record.spkIdUsed)) : null;
    }),
    saveRatchetSession: vi.fn((upeerId: string, state: unknown, spkIdUsed?: number | null, contextId = 'direct') => {
        const serialized = serializeState(state as never, spkIdUsed);
        ratchetStores[currentRole].set(`${contextId}:${upeerId}`, { state: deserializeState(serialized).state, spkIdUsed });
    }),
    deleteRatchetSession: vi.fn((upeerId: string, contextId?: string) => {
        for (const key of ratchetStores[currentRole].keys()) {
            if (key === `${contextId}:${upeerId}` || (!contextId && key.endsWith(`:${upeerId}`))) ratchetStores[currentRole].delete(key);
        }
    }),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    getMessageById: vi.fn((id: string) => messageStores.get(id)),
    saveMessage: vi.fn(async (id: string, chatUpeerId: string, isMine: boolean, message: string) => {
        messageStores.set(id, { id, chatUpeerId, message, isMine: Number(isMine) });
        return { changes: 1 };
    }),
}));

vi.mock('../../../src/main_process/storage/ratchet/incomingMessageTransaction.js', () => ({
    commitRatchetIncomingMessage: vi.fn((message, state, spkIdUsed) => {
        ratchetStores[currentRole].set(`direct:${message.chatUpeerId}`, {
            state: deserializeState(serializeState(state, spkIdUsed)).state,
            spkIdUsed,
        });
        messageStores.set(message.id, { ...message, isMine: Number(message.isMine) });
        return { changes: 1 };
    }),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        replicateToVaults: vi.fn(async () => 1),
    },
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    issueVouch: vi.fn(async () => undefined),
    VouchType: { HANDSHAKE: 'HANDSHAKE' },
}));

describe('Double Ratchet flow integration', () => {
    beforeEach(() => {
        ratchetStores.alice.clear();
        ratchetStores.bob.clear();
        messageStores.clear();
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
        expect(ratchetStores.alice.get('direct:bob-peer')).toBeDefined();

        setRole('bob');
        const firstPlaintext = await decryptDoubleRatchetPayload('alice-peer', firstDecryptPayload);

        expect(firstPlaintext).toBe('hola bob');
        expect(ratchetStores.bob.get('direct:alice-peer')).toBeDefined();

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

    it('consumes a retransmitted packet with the same ID before acknowledging a lost-ACK retry', async () => {
        const { encryptChatPayload } = await import('../../../src/main_process/network/messaging/chatEncryption.js');
        const { handleChatMessage } = await import('../../../src/main_process/network/handlers/chat.js');
        const { getMessageById } = await import('../../../src/main_process/storage/messages/operations.js');
        const sendResponse = vi.fn();
        const window = { webContents: { send: vi.fn() }, isFocused: () => true } as never;
        const contact = { upeerId: 'alice-peer', name: 'Alice' };
        const messageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

        setRole('alice');
        const original = await encryptChatPayload('bob-peer', 'message after lost ACK', {
            publicKey: identities.bob.publicKeyHex,
            signedPreKey: identities.bob.spkPk.toString('hex'),
            signedPreKeyId: identities.bob.spkId,
        });
        setRole('bob');
        await handleChatMessage('alice-peer', contact, {
            id: messageId,
            content: original.content,
            nonce: original.nonce,
            ratchetHeader: original.ratchetHeader,
            x3dhInit: normalizeX3dhInit(original.x3dhInit),
        }, window, 'sig', '200::alice', sendResponse);

        expect(sendResponse).toHaveBeenCalledWith('200::alice', expect.objectContaining({ type: 'ACK', id: messageId }));
        const firstSession = ratchetStores.bob.get('direct:alice-peer');
        expect(firstSession).toBeDefined();
        const ratchetModule = await import('../../../src/main_process/security/ratchet.js');
        const initBob = vi.spyOn(ratchetModule, 'ratchetInitBob');

        sendResponse.mockClear();
        await handleChatMessage('alice-peer', contact, {
            id: messageId,
            content: original.content,
            nonce: original.nonce,
            ratchetHeader: original.ratchetHeader,
            x3dhInit: normalizeX3dhInit(original.x3dhInit),
        }, window, 'sig', '200::alice', sendResponse);
        expect(sendResponse).toHaveBeenCalledWith('200::alice', expect.objectContaining({ type: 'ACK', id: messageId }));
        expect(ratchetStores.bob.get('direct:alice-peer')?.state).toEqual(firstSession?.state);
        initBob.mockRestore();

        setRole('alice');
        ratchetStores.alice.delete('direct:bob-peer');
        const retryAfterReset = await encryptChatPayload('bob-peer', 'message after lost ACK', {
            publicKey: identities.bob.publicKeyHex,
            signedPreKey: identities.bob.spkPk.toString('hex'),
            signedPreKeyId: identities.bob.spkId,
        });
        setRole('bob');
        ratchetStores.bob.delete('direct:alice-peer');

        sendResponse.mockClear();
        await handleChatMessage('alice-peer', contact, {
            id: messageId,
            content: retryAfterReset.content,
            nonce: retryAfterReset.nonce,
            ratchetHeader: retryAfterReset.ratchetHeader,
            x3dhInit: normalizeX3dhInit(retryAfterReset.x3dhInit),
        }, window, 'sig', '200::alice', sendResponse);

        expect(ratchetStores.bob.get('direct:alice-peer')).toBeDefined();
        expect(sendResponse).toHaveBeenCalledWith('200::alice', expect.objectContaining({ type: 'ACK', id: messageId }));
        expect(getMessageById).toHaveBeenCalled();
        expect(messageStores.get(messageId)?.message).toBe('message after lost ACK');
        expect(firstSession).toBeDefined();
    });

    it('preserves the ratchet when a vaulted group invite is replayed after out-of-order delivery', async () => {
        const { encryptChatPayload } = await import('../../../src/main_process/network/messaging/chatEncryption.js');
        const { decryptDoubleRatchetPayload } = await import('../../../src/main_process/network/handlers/doubleRatchetDecrypt.js');
        const { decryptGroupControlPayload } = await import('../../../src/main_process/network/handlers/groupControlShared.js');
        const groupPayload = JSON.stringify({
            groupName: 'Grupo test',
            members: ['alice-peer', 'bob-peer'],
            epoch: 1,
            senderKey: '55'.repeat(32),
        });

        setRole('alice');
        const beforeGroup = await encryptChatPayload('bob-peer', 'privado antes del grupo', {
            publicKey: identities.bob.publicKeyHex,
            signedPreKey: identities.bob.spkPk.toString('hex'),
            signedPreKeyId: identities.bob.spkId,
        });
        setRole('bob');
        expect(await decryptDoubleRatchetPayload('alice-peer', toDecryptPayload(beforeGroup))).toBe('privado antes del grupo');

        setRole('alice');
        const groupInvite = await encryptChatPayload('bob-peer', groupPayload, {
            publicKey: identities.bob.publicKeyHex,
            signedPreKey: identities.bob.spkPk.toString('hex'),
            signedPreKeyId: identities.bob.spkId,
        }, 'group:group-test');
        const privateAfterInvite = await encryptChatPayload('bob-peer', 'privado después de la invitación', {
            publicKey: identities.bob.publicKeyHex,
            signedPreKey: identities.bob.spkPk.toString('hex'),
            signedPreKeyId: identities.bob.spkId,
        });

        expect(ratchetStores.alice.has('group:group-test:bob-peer')).toBe(true);
        expect(ratchetStores.alice.has('direct:bob-peer')).toBe(true);

        setRole('bob');
        expect(await decryptDoubleRatchetPayload('alice-peer', toDecryptPayload(privateAfterInvite))).toBe('privado después de la invitación');

        const delayedInvite = await decryptGroupControlPayload('alice-peer', {
            groupId: 'group-test',
            payload: groupInvite.content,
            nonce: groupInvite.nonce,
            ratchetHeader: groupInvite.ratchetHeader,
            x3dhInit: normalizeX3dhInit(groupInvite.x3dhInit),
        });
        expect(delayedInvite).toEqual(JSON.parse(groupPayload));
        expect(ratchetStores.bob.has('group:group-test:alice-peer')).toBe(true);
        expect(ratchetStores.bob.has('direct:alice-peer')).toBe(true);

        const { getRatchetSession } = await import('../../../src/main_process/storage/ratchet/operations.js');
        const ratchetBeforeReplay = getRatchetSession('alice-peer', 'group:group-test');
        expect(ratchetBeforeReplay).toBeTruthy();
        const reset = vi.fn();
        setRole('bob');
        const replayedVaultInvite = await decryptGroupControlPayload('alice-peer', {
            groupId: 'group-test',
            payload: groupInvite.content,
            nonce: groupInvite.nonce,
            ratchetHeader: groupInvite.ratchetHeader,
        }, reset);
        expect(replayedVaultInvite).toBeNull();
        expect(reset).not.toHaveBeenCalled();
        expect(ratchetStores.bob.has('group:group-test:alice-peer')).toBe(true);
        expect(ratchetStores.bob.has('direct:alice-peer')).toBe(true);
        setRole('bob');
        const ratchetAfterReplay = getRatchetSession('alice-peer', 'group:group-test');
        expect(ratchetAfterReplay?.state.nr).toBe(ratchetBeforeReplay?.state.nr);
        expect(ratchetAfterReplay?.state.dhsPk.equals(ratchetBeforeReplay?.state.dhsPk ?? Buffer.alloc(0))).toBe(true);
        expect(getRatchetSession('alice-peer', 'direct')).toBeTruthy();

        const nextPrivate = await encryptChatPayload('bob-peer', 'privado tras replay del vault', {
            publicKey: identities.bob.publicKeyHex,
            signedPreKey: identities.bob.spkPk.toString('hex'),
            signedPreKeyId: identities.bob.spkId,
        });
        setRole('bob');
        expect(await decryptDoubleRatchetPayload('alice-peer', toDecryptPayload(nextPrivate))).toBe('privado tras replay del vault');
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
