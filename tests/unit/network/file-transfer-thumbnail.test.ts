import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';

const { mockUnsealTransferKey } = vi.hoisted(() => ({
    mockUnsealTransferKey: vi.fn(),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'my-peer-id'),
    sign: vi.fn(() => Buffer.from('signature')),
    verify: vi.fn(() => true),
    encrypt: vi.fn(() => ({ ciphertext: 'aabbcc', nonce: 'ddeeff' })),
    decrypt: vi.fn(() => Buffer.from('a'.repeat(32))),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn().mockResolvedValue({
        upeerId: 'peer-id',
        publicKey: 'aa'.repeat(32),
        ephemeralPublicKey: 'bb'.repeat(32),
        address: '200::1',
        status: 'connected',
    }),
    getContacts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../src/main_process/storage/shared.js', () => ({ getDb: vi.fn() }));

vi.mock('../../../src/main_process/network/file-transfer/db-helper.js', () => ({
    saveTransferToDB: vi.fn().mockResolvedValue(undefined),
    updateTransferMessageStatus: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../src/main_process/security/reputation/vouches.js', () => ({
    computeScore: vi.fn(() => 100),
}));

vi.mock('../../../src/main_process/network/vault/manager.js', () => ({
    VaultManager: {
        replicateToVaults: vi.fn().mockResolvedValue(3),
        getDynamicReplicationFactor: vi.fn().mockResolvedValue(3),
    },
}));

vi.mock('../../../src/main_process/network/file-transfer/crypto.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../../src/main_process/network/file-transfer/crypto.js')>();
    return { ...original, unsealTransferKey: mockUnsealTransferKey };
});

import { encryptChunk, decryptChunk } from '../../../src/main_process/network/file-transfer/crypto.js';
import { TransferManager } from '../../../src/main_process/network/file-transfer/transfer-manager.js';

const FILE_ID_1 = '550e8400-e29b-41d4-a716-446655440001';
const FILE_ID_2 = '550e8400-e29b-41d4-a716-446655440002';
const FILE_ID_3 = '550e8400-e29b-41d4-a716-446655440003';
const FILE_ID_4 = '550e8400-e29b-41d4-a716-446655440004';
const FILE_ID_5 = '550e8400-e29b-41d4-a716-446655440005';
const VALID_HASH = 'a'.repeat(64);
const THUMB_BYTES = Buffer.from('fake-thumbnail-jpeg-bytes');
const THUMB_B64 = THUMB_BYTES.toString('base64');
const THUMB_DATAURI = `data:image/jpeg;base64,${THUMB_B64}`;

function buildProposal(fileId: string, aesKey: Buffer, overrides: Record<string, unknown> = {}) {
    const encThumb = encryptChunk(THUMB_BYTES, aesKey);
    return {
        type: 'FILE_PROPOSAL',
        fileId,
        fileName: 'photo.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg',
        totalChunks: 1,
        chunkSize: 1024,
        fileHash: VALID_HASH,
        encryptedKey: 'aabbcc',
        encryptedKeyNonce: 'ddeeff',
        thumbnail: encThumb,
        signature: 'deadbeef',
        ...overrides,
    };
}

describe('thumbnail roundtrip – emisor → receptor', () => {
    let manager: TransferManager;
    const safeSendCalls: Array<{ channel: string; data: unknown }> = [];
    const realAesKey = crypto.randomBytes(32);
    const mockWindow = {
        isDestroyed: vi.fn(() => false),
        webContents: { send: vi.fn() },
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
        safeSendCalls.length = 0;
        mockUnsealTransferKey.mockReturnValue(realAesKey);

        manager = new TransferManager();
        manager.initialize(vi.fn(), mockWindow);
        manager.ui.safeSend = (channel: string, data: unknown) => {
            safeSendCalls.push({ channel, data });
        };
    });

    it('encryptChunk / decryptChunk son inversos exactos', () => {
        const key = crypto.randomBytes(32);
        const original = Buffer.from('test-thumbnail-data');
        const { data, iv, tag } = encryptChunk(original, key);
        const recovered = decryptChunk(data, iv, tag, key);
        expect(recovered).toEqual(original);
    });

    it('handleFileProposal desencripta thumbnail y lo almacena como data URI', async () => {
        const proposal = buildProposal(FILE_ID_1, realAesKey);
        await manager.handleFileProposal('peer-id', '200::1', proposal);

        const transfer = manager.store.getTransfer(FILE_ID_1, 'receiving');
        expect(transfer).toBeDefined();
        expect(transfer?.thumbnail).toBe(THUMB_DATAURI);
    });

    it('receive-p2p-message incluye thumbnail en el JSON del mensaje', async () => {
        const proposal = buildProposal(FILE_ID_2, realAesKey);
        await manager.handleFileProposal('peer-id', '200::1', proposal);

        const receiveEvent = safeSendCalls.find(c => c.channel === 'receive-p2p-message');
        expect(receiveEvent).toBeDefined();

        const payload = receiveEvent?.data as { message: string };
        const messageJson = JSON.parse(payload.message);
        expect(messageJson.thumbnail).toBe(THUMB_DATAURI);
        expect(messageJson.direction).toBe('receiving');
    });

    it('file-transfer-started se emite al aceptar la propuesta', async () => {
        const proposal = buildProposal(FILE_ID_3, realAesKey);
        await manager.handleFileProposal('peer-id', '200::1', proposal);

        const startedEvent = safeSendCalls.find(c => c.channel === 'file-transfer-started');
        expect(startedEvent).toBeDefined();
    });

    it('si unsealTransferKey falla, thumbnail queda undefined y el transfer se crea igual', async () => {
        mockUnsealTransferKey.mockReturnValue(null);
        const proposal = buildProposal(FILE_ID_4, realAesKey);
        await manager.handleFileProposal('peer-id', '200::1', proposal);

        const transfer = manager.store.getTransfer(FILE_ID_4, 'receiving');
        expect(transfer).toBeDefined();
        expect(transfer?.thumbnail).toBeUndefined();
    });

    it('file-transfer-completed lleva direction y tempPath en el payload', async () => {
        const proposal = buildProposal(FILE_ID_5, realAesKey);
        await manager.handleFileProposal('peer-id', '200::1', proposal);

        manager.store.updateTransfer(FILE_ID_5, 'receiving', { tempPath: '/assets/received/photo.jpg' });
        const transfer = manager.store.getTransfer(FILE_ID_5, 'receiving');
        if (!transfer) throw new Error('Transfer not found');
        manager.ui.notifyCompleted(transfer);

        const completedEvent = safeSendCalls.find(c => c.channel === 'file-transfer-completed');
        expect(completedEvent).toBeDefined();

        const payload = completedEvent?.data as { direction: string; tempPath: string };
        expect(payload.direction).toBe('receiving');
        expect(payload.tempPath).toBe('/assets/received/photo.jpg');
    });

    it('roundtrip completo: thumbnail cifrado → descifrado llega en el mensaje del chat', async () => {
        const aesKey = crypto.randomBytes(32);
        mockUnsealTransferKey.mockReturnValue(aesKey);

        const thumbBytes = Buffer.from('JPEG_DATA_SIMULATED');
        const thumbB64 = thumbBytes.toString('base64');
        const dataUri = `data:image/jpeg;base64,${thumbB64}`;
        const encThumb = encryptChunk(thumbBytes, aesKey);

        const roundtripId = '550e8400-e29b-41d4-a716-446655440099';
        const proposal = buildProposal(roundtripId, aesKey, { thumbnail: encThumb, fileSize: 2048, totalChunks: 2 });
        await manager.handleFileProposal('peer-id', '200::1', proposal);

        const receiveEvent = safeSendCalls.find(c => c.channel === 'receive-p2p-message');
        expect(receiveEvent).toBeDefined();

        const receivePayload = receiveEvent?.data as { message: string };
        const parsed = JSON.parse(receivePayload.message);
        expect(parsed.thumbnail).toBe(dataUri);
    });
});
