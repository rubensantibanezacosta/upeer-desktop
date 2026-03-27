import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerFileHandlers } from '../../../../src/main_process/core/ipcHandlers/files.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

type PersistInternalAssetPayload = { filePath: string; fileName: string };
type OpenFilePayload = { filePath: string };
type HandlerResult = { success: boolean; path?: string; error?: string };
type IpcHandler<TPayload> = (event: unknown, payload: TPayload) => Promise<HandlerResult>;
type EventWithSender = { sender: { id: number } };

function getHandler<TPayload>(channel: string): IpcHandler<TPayload> {
    const call = vi.mocked(ipcMain.handle).mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    if (!call) throw new Error(`Missing handler for ${channel}`);
    return call[1] as IpcHandler<TPayload>;
}

vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn(),
    },
    app: {
        getPath: vi.fn((name) => {
            if (name === 'userData') return '/data/user';
            if (name === 'home') return '/home/user';
            if (name === 'temp') return '/tmp';
            if (name === 'downloads') return '/home/user/Downloads';
            return '/';
        }),
    },
    shell: {
        openPath: vi.fn(),
    },
    BrowserWindow: {
        fromWebContents: vi.fn(),
    },
    dialog: {
        showOpenDialog: vi.fn(),
        showSaveDialog: vi.fn(),
    },
}));

vi.mock('node:fs/promises', () => ({
    default: {
        stat: vi.fn(),
        readFile: vi.fn(),
        access: vi.fn(),
        mkdir: vi.fn(),
        copyFile: vi.fn(),
    }
}));

vi.mock('node:fs', () => ({
    default: {
        existsSync: vi.fn(),
    }
}));

vi.mock('../../../../src/main_process/security/secure-logger.js', () => ({
    error: vi.fn(),
}));

describe('File Persistence & Access Policies', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        registerFileHandlers();
    });

    describe('persist-internal-asset handler', () => {
        it('should copy file to the assets directory with a unique name', async () => {
            const handler = getHandler<PersistInternalAssetPayload>('persist-internal-asset');

            const sourcePath = '/home/user/external-file.jpg';
            const fileName = 'test.jpg';
            const event: EventWithSender = { sender: { id: 101 } };

            vi.mocked(fsSync.existsSync).mockReturnValue(true);
            vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true } as Awaited<ReturnType<typeof fs.stat>>);
            vi.mocked(fs.copyFile).mockResolvedValue(undefined);

            await getHandler<PersistInternalAssetPayload>('register-trusted-selected-file')(event, { filePath: sourcePath, fileName });
            const result = await handler(event, { filePath: sourcePath, fileName });

            expect(result.success).toBe(true);
            expect(result.path).toContain('/data/user/assets/');
            expect(result.path).toContain('.jpg');
            expect(fs.copyFile).toHaveBeenCalledWith(path.resolve(sourcePath), result.path);
        });

        it('should create assets directory if it does not exist', async () => {
            const handler = getHandler<PersistInternalAssetPayload>('persist-internal-asset');
            const sourcePath = '/home/user/Downloads/file.txt';
            const event: EventWithSender = { sender: { id: 202 } };

            vi.mocked(fsSync.existsSync).mockReturnValue(false);
            vi.mocked(fs.mkdir).mockResolvedValue(undefined);
            vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true } as Awaited<ReturnType<typeof fs.stat>>);
            vi.mocked(fs.copyFile).mockResolvedValue(undefined);

            await getHandler<PersistInternalAssetPayload>('register-trusted-selected-file')(event, { filePath: sourcePath, fileName: 'file.txt' });
            await handler(event, { filePath: sourcePath, fileName: 'file.txt' });

            expect(fs.mkdir).toHaveBeenCalledWith('/data/user/assets', { recursive: true });
        });
    });

    describe('open-file security policy', () => {
        it('should allow opening files from assets directory', async () => {
            const handler = getHandler<OpenFilePayload>('open-file');

            const assetPath = '/data/user/assets/123-file.jpg';
            vi.mocked(fs.access).mockResolvedValue(undefined);
            const { shell } = await import('electron');

            const result = await handler({}, { filePath: assetPath });

            expect(result.success).toBe(true);
            expect(shell.openPath).toHaveBeenCalled();
        });

        it('should deny opening sensitive system files', async () => {
            const handler = getHandler<OpenFilePayload>('open-file');

            const sensitivePath = '/etc/shadow';
            const result = await handler({}, { filePath: sensitivePath });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Acceso denegado');
            const { shell } = await import('electron');
            expect(shell.openPath).not.toHaveBeenCalled();
        });

        it('should allow opening files from downloads directory', async () => {
            const handler = getHandler<OpenFilePayload>('open-file');

            const downloadPath = '/home/user/Downloads/received.pdf';
            vi.mocked(fs.access).mockResolvedValue(undefined);

            const result = await handler({}, { filePath: downloadPath });

            expect(result.success).toBe(true);
        });
    });
});
