import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UINotifier } from '../../../src/main_process/network/file-transfer/ui-notifier.js';
import type { FileTransfer } from '../../../src/main_process/network/file-transfer/types.js';

const getMessageById = vi.fn();

vi.mock('electron', () => ({
    BrowserWindow: {
        getAllWindows: vi.fn(() => []),
    },
}));

vi.mock('../../../src/main_process/network/file-transfer/db-helper.js', () => ({
    updateTransferMessageStatus: vi.fn(),
    saveTransferToDB: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/status.js', () => ({
    getMessageStatus: vi.fn(),
    updateMessageStatus: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    getMessageById: (...args: unknown[]) => getMessageById(...(args as [])),
}));

const SENT_AT = 1_700_000_000_000;
const RECEIVED_AT = 1_800_000_000_000;

const receiving = {
    fileId: 'file-1',
    messageId: 'msg-1',
    direction: 'receiving',
    upeerId: 'peer-1',
    chatUpeerId: 'peer-1',
    fileName: 'foto.jpg',
    fileSize: 10,
    mimeType: 'image/jpeg',
    totalChunks: 1,
    chunkSize: 1024,
    chunksProcessed: 0,
    state: 'active',
    phase: 'PROPOSED',
    startedAt: RECEIVED_AT,
    fileHash: 'a'.repeat(64),
} as unknown as FileTransfer;

const makeWindow = (send: (...args: unknown[]) => void) => ({
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send },
}) as never;

function emittedTimestamp(send: ReturnType<typeof vi.fn>): unknown {
    const call = send.mock.calls.find(([channel]) => channel === 'receive-p2p-message');
    if (!call) throw new Error('no se emitió receive-p2p-message');
    return (call[1] as { timestamp?: unknown }).timestamp;
}

describe('UINotifier.notifyReceiveMessage: hora del adjunto', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(RECEIVED_AT);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('usa la hora del mensaje original y no la de recepción', () => {
        const send = vi.fn();
        getMessageById.mockReturnValue({ id: 'msg-1', timestamp: SENT_AT });

        new UINotifier(makeWindow(send)).notifyReceiveMessage(receiving, 'peer-1');

        expect(getMessageById).toHaveBeenCalledWith('msg-1');
        expect(emittedTimestamp(send)).toBe(SENT_AT);
    });

    it('cae en la hora de recepción si el mensaje aún no está aplicado', () => {
        const send = vi.fn();
        getMessageById.mockReturnValue(undefined);

        new UINotifier(makeWindow(send)).notifyReceiveMessage(receiving, 'peer-1');

        expect(emittedTimestamp(send)).toBe(RECEIVED_AT);
    });

    it('acepta la hora guardada como cadena numérica', () => {
        const send = vi.fn();
        getMessageById.mockReturnValue({ id: 'msg-1', timestamp: String(SENT_AT) });

        new UINotifier(makeWindow(send)).notifyReceiveMessage(receiving, 'peer-1');

        expect(emittedTimestamp(send)).toBe(SENT_AT);
    });

    it('mantiene la hora original en los adjuntos de grupo', () => {
        const send = vi.fn();
        getMessageById.mockReturnValue({ id: 'msg-1', timestamp: SENT_AT });
        const groupTransfer = { ...receiving, chatUpeerId: 'grp-abc' } as FileTransfer;

        new UINotifier(makeWindow(send)).notifyReceiveMessage(groupTransfer, 'peer-1');

        const call = send.mock.calls.find(([channel]) => channel === 'receive-group-message');
        expect(call).toBeDefined();
        const payload = (call?.[1] ?? {}) as { timestamp?: unknown };
        expect(payload.timestamp).toBe(SENT_AT);
    });
});
