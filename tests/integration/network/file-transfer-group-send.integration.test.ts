import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain, app } from 'electron';
import { registerFileTransferHandlers } from '../../../src/main_process/core/ipcHandlers/fileTransfer.js';
import fs from 'node:fs/promises';

vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn() },
    app: { getPath: vi.fn((name: string) => (name === 'userData' ? '/home/user/.config/upeer' : '/home/user')) },
}));

vi.mock('node:fs/promises', () => ({ default: { stat: vi.fn() } }));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({ error: vi.fn() }));

vi.mock('../../../src/main_process/network/file-transfer/transfer-manager.js', () => ({
    fileTransferManager: {
        startSend: vi.fn(async () => 'file-id'),
        validator: { detectMimeType: vi.fn(() => 'application/octet-stream') },
    },
}));

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    getGroupById: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/messages/operations.js', () => ({
    saveFileMessage: vi.fn(),
}));

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'self-id'),
}));

import { fileTransferManager } from '../../../src/main_process/network/file-transfer/transfer-manager.js';

type StartPayload = { upeerId: string; filePath: string };
type Handler = (event: unknown, payload: StartPayload) => Promise<{ success: boolean; fileId?: string; error?: string }>;

function getHandler(channel: string): Handler {
    const call = vi.mocked(ipcMain.handle).mock.calls.find(([c]) => c === channel);
    if (!call) throw new Error(`Missing handler for ${channel}`);
    return call[1] as Handler;
}

describe('multi-send de archivo a grupo (integración)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(app.getPath).mockReturnValue('/home/user/.config/upeer');
        vi.mocked(fs.stat).mockResolvedValue({ size: 4096, isFile: () => true } as Awaited<ReturnType<typeof fs.stat>>);
        registerFileTransferHandlers();
    });

    it('inicia la transferencia a los 40 miembros del grupo y guarda el mensaje', async () => {
        const { getGroupById } = await import('../../../src/main_process/storage/groups/operations.js');
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');
        const { saveFileMessage } = await import('../../../src/main_process/storage/messages/operations.js');

        const members = ['self-id'];
        for (let i = 0; i < 40; i += 1) members.push(`peer-${i}`);
        vi.mocked(getGroupById).mockReturnValue({
            groupId: 'grp-big-send',
            name: 'Grupo grande envío',
            status: 'active',
            members,
            epoch: 1,
        } as never);
        vi.mocked(getContactByUpeerId).mockImplementation((id: string) =>
            id === 'self-id' ? undefined : { upeerId: id, publicKey: 'aa', address: `200::${id}` } as never);

        const handler = getHandler('start-file-transfer');
        const result = await handler({}, {
            upeerId: 'grp-big-send',
            filePath: '/home/user/.config/upeer/assets/doc.bin',
        });

        expect(result.success).toBe(true);
        expect(fileTransferManager.startSend).toHaveBeenCalledTimes(40);
        expect(saveFileMessage).toHaveBeenCalledTimes(1);
    });

    it('omite a los miembros sin clave pública sin romper el envío a los demás', async () => {
        const { getGroupById } = await import('../../../src/main_process/storage/groups/operations.js');
        const { getContactByUpeerId } = await import('../../../src/main_process/storage/contacts/operations.js');

        const members = ['self-id', 'alice', 'bob', 'carol'];
        vi.mocked(getGroupById).mockReturnValue({
            groupId: 'grp-mixed',
            name: 'Grupo mixto envío',
            status: 'active',
            members,
            epoch: 1,
        } as never);
        vi.mocked(getContactByUpeerId).mockImplementation((id: string) => {
            if (id === 'alice' || id === 'bob') return { upeerId: id, publicKey: 'aa', address: `200::${id}` } as never;
            return undefined;
        });

        const handler = getHandler('start-file-transfer');
        const result = await handler({}, {
            upeerId: 'grp-mixed',
            filePath: '/home/user/.config/upeer/assets/doc.bin',
        });

        expect(result.success).toBe(true);
        expect(fileTransferManager.startSend).toHaveBeenCalledTimes(2);
    });
});
