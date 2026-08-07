import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain, app } from 'electron';
import { registerFileTransferHandlers } from '../../../../src/main_process/core/ipcHandlers/fileTransfer.js';
import fs from 'node:fs/promises';

vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn() },
    app: { getPath: vi.fn((name: string) => (name === 'userData' ? '/home/user/.config/upeer' : '/home/user')) },
}));

vi.mock('node:fs/promises', () => ({ default: { stat: vi.fn() } }));

vi.mock('../../../../src/main_process/security/secure-logger.js', () => ({ error: vi.fn() }));

vi.mock('../../../../src/main_process/network/file-transfer/transfer-manager.js', () => ({
    fileTransferManager: {
        startSend: vi.fn(async () => 'file-id'),
        validator: { detectMimeType: vi.fn(() => 'image/png') },
    },
}));

vi.mock('../../../../src/main_process/storage/groups/operations.js', () => ({
    getGroupById: vi.fn(),
}));

vi.mock('../../../../src/main_process/storage/contacts/operations.js', () => ({
    getContactByUpeerId: vi.fn(),
}));

vi.mock('../../../../src/main_process/storage/messages/operations.js', () => ({
    saveFileMessage: vi.fn(),
}));

vi.mock('../../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'self-id'),
}));

import { getGroupById } from '../../../../src/main_process/storage/groups/operations.js';
import { getContactByUpeerId } from '../../../../src/main_process/storage/contacts/operations.js';
import { saveFileMessage } from '../../../../src/main_process/storage/messages/operations.js';
import { getMyUPeerId } from '../../../../src/main_process/security/identity.js';
import { fileTransferManager } from '../../../../src/main_process/network/file-transfer/transfer-manager.js';

const startSend = fileTransferManager.startSend as ReturnType<typeof vi.fn>;

type StartPayload = { upeerId: string; filePath: string };
type Handler = (event: unknown, payload: StartPayload) => Promise<{ success: boolean; fileId?: string; error?: string }>;

function getHandler(channel: string): Handler {
    const call = vi.mocked(ipcMain.handle).mock.calls.find(([c]) => c === channel);
    if (!call) throw new Error(`Missing handler for ${channel}`);
    return call[1] as Handler;
}

describe('start-file-transfer multi-send a grupo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(app.getPath).mockReturnValue('/home/user/.config/upeer');
        vi.mocked(fs.stat).mockResolvedValue({ size: 2048, isFile: () => true } as Awaited<ReturnType<typeof fs.stat>>);
        vi.mocked(fileTransferManager.startSend).mockResolvedValue('file-id');
        registerFileTransferHandlers();
    });

    it('envía el archivo a todos los miembros del grupo en paralelo y cuenta los iniciados', async () => {
        vi.mocked(getGroupById).mockReturnValue({
            groupId: 'grp-x',
            name: 'Grupo',
            status: 'active',
            members: ['self-id', 'alice', 'bob', 'carol'],
            epoch: 1,
        } as never);
        vi.mocked(getContactByUpeerId).mockImplementation((id: string) => {
            if (id === 'alice') return { upeerId: id, publicKey: 'aa', address: '200::1' } as never;
            if (id === 'bob') return { upeerId: id, publicKey: 'bb', address: '200::2' } as never;
            if (id === 'carol') return { upeerId: id, publicKey: 'cc', address: '200::3' } as never;
            return null;
        });
        vi.mocked(getMyUPeerId).mockReturnValue('self-id');

        const handler = getHandler('start-file-transfer');
        const result = await handler({}, {
            upeerId: 'grp-x',
            filePath: '/home/user/.config/upeer/assets/foto.png',
        });

        expect(result.success).toBe(true);
        expect(startSend).toHaveBeenCalledTimes(3);
        expect(saveFileMessage).toHaveBeenCalledWith(
            expect.any(String),
            'grp-x',
            true,
            'foto.png',
            expect.any(String),
            2048,
            'image/png',
            '/home/user/.config/upeer/assets/foto.png',
            undefined,
            'sent',
            'self-id',
            undefined,
            undefined,
            undefined,
            undefined
        );
    });

    it('devuelve error cuando ningún miembro tiene clave pública', async () => {
        vi.mocked(getGroupById).mockReturnValue({
            groupId: 'grp-x',
            name: 'Grupo',
            status: 'active',
            members: ['self-id', 'alice', 'bob'],
            epoch: 1,
        } as never);
        vi.mocked(getContactByUpeerId).mockResolvedValue(null);

        const handler = getHandler('start-file-transfer');
        const result = await handler({}, {
            upeerId: 'grp-x',
            filePath: '/home/user/.config/upeer/assets/foto.png',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No valid group recipients');
        expect(startSend).not.toHaveBeenCalled();
    });
});
