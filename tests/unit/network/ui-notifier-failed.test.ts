import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UINotifier } from '../../../src/main_process/network/file-transfer/ui-notifier.js';
import type { FileTransfer } from '../../../src/main_process/network/file-transfer/types.js';

const updateTransferMessageStatus = vi.fn(async () => true);
const getMessageStatus = vi.fn(() => 'sent');

vi.mock('electron', () => ({
    BrowserWindow: {
        getAllWindows: vi.fn(() => [{ webContents: { send: vi.fn() } }]),
    },
}));

vi.mock('../../../src/main_process/network/file-transfer/db-helper.js', () => ({
    updateTransferMessageStatus: (...args: unknown[]) => updateTransferMessageStatus(...(args as [])),
    saveTransferToDB: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/status.js', () => ({
    getMessageStatus: () => getMessageStatus(),
    updateMessageStatus: vi.fn(),
}));

const sending = {
    fileId: 'file-1',
    messageId: 'msg-1',
    direction: 'sending',
    upeerId: 'peer-1',
    fileName: 'fallo.png',
    fileSize: 10,
    mimeType: 'image/png',
    totalChunks: 1,
    chunkSize: 1024,
    chunksProcessed: 0,
    progress: 0,
    state: 'failed',
    phase: 'PROPOSED',
    timestamp: 1,
    fileHash: 'a'.repeat(64),
    chatUpeerId: 'peer-1',
} as unknown as FileTransfer;

const makeWindow = (send: (...args: unknown[]) => void = () => { }) => ({
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send },
}) as never;

describe('UINotifier.notifyFailed', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        updateTransferMessageStatus.mockResolvedValue(true);
        getMessageStatus.mockReturnValue('sent');
    });

    it('guarda el estado fallido en la base de datos', async () => {
        const window = makeWindow();
        const notifier = new UINotifier(window);

        notifier.notifyFailed(sending, 'vault_replication_failed');
        await vi.waitFor(() => expect(updateTransferMessageStatus).toHaveBeenCalledWith('msg-1', 'failed'));
    });

    it('avisa al renderer cuando el estado se ha guardado', async () => {
        const send = vi.fn();
        const notifier = new UINotifier(makeWindow(send));

        notifier.notifyFailed(sending, 'vault_replication_failed');
        await vi.waitFor(() => expect(send).toHaveBeenCalledWith('message-status-updated', { id: 'msg-1', status: 'failed' }));
    });

    it('no degrada un mensaje ya entregado', async () => {
        const send = vi.fn();
        const notifier = new UINotifier(makeWindow(send));
        updateTransferMessageStatus.mockResolvedValue(false);
        getMessageStatus.mockReturnValue('delivered');

        notifier.notifyFailed(sending, 'peer_disconnected');
        await vi.waitFor(() => expect(updateTransferMessageStatus).toHaveBeenCalled());

        expect(send).not.toHaveBeenCalledWith('message-status-updated', expect.anything());
    });

    it('avisa igualmente cuando la transferencia no tiene mensaje asociado', async () => {
        const send = vi.fn();
        const notifier = new UINotifier(makeWindow(send));
        updateTransferMessageStatus.mockResolvedValue(false);
        getMessageStatus.mockReturnValue(null as never);

        notifier.notifyFailed(sending, 'peer_disconnected');
        await vi.waitFor(() => expect(send).toHaveBeenCalledWith('message-status-updated', { id: 'msg-1', status: 'failed' }));
    });
});
