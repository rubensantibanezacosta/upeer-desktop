import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain, shell } from 'electron';
import { registerFileHandlers } from '../../../../src/main_process/core/ipcHandlers/files.js';
import fs from 'node:fs/promises';
import path from 'node:path';

type EventWithSender = { sender: { id: number } };
type OpenFilePayload = { filePath: string };
type PersistPayload = { filePath: string; fileName: string };
type SaveBufferPayload = { base64: string; fileName: string };
type HandlerResult = { success: boolean; path?: string; error?: string };
type IpcHandler<TPayload> = (event: unknown, payload: TPayload) => Promise<HandlerResult>;

function getHandler<TPayload>(channel: string): IpcHandler<TPayload> {
    const call = vi.mocked(ipcMain.handle).mock.calls.find(([registeredChannel]) => registeredChannel === channel);
    if (!call) throw new Error(`Missing handler for ${channel}`);
    return call[1] as IpcHandler<TPayload>;
}

vi.mock('electron', () => {
    return {
        ipcMain: {
            handle: vi.fn(),
        },
        app: {
            getPath: vi.fn((name: string) => {
                if (name === 'userData') return '/home/user/.config/upeer';
                if (name === 'temp') return '/tmp';
                if (name === 'downloads') return '/home/user/Downloads';
                return '/home/user';
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
    };
});

vi.mock('node:fs/promises', () => ({
    default: {
        stat: vi.fn(),
        readFile: vi.fn(),
        access: vi.fn(),
        mkdir: vi.fn(),
        writeFile: vi.fn(),
        copyFile: vi.fn(),
    }
}));

vi.mock('node:fs', () => ({
    default: {
        existsSync: vi.fn(() => true),
    }
}));

// Mock secure logger to avoid errors
vi.mock('../../../../src/main_process/security/secure-logger.js', () => ({
    error: vi.fn(),
}));

describe('files IPC handlers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        registerFileHandlers();
        vi.mocked(fs.stat).mockResolvedValue({
            size: 1024,
            mtimeMs: 123,
            isFile: () => true,
        } as Awaited<ReturnType<typeof fs.stat>>);
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);
        vi.mocked(fs.copyFile).mockResolvedValue(undefined);
    });

    it('should register open-file handler', () => {
        expect(ipcMain.handle).toHaveBeenCalledWith('open-file', expect.any(Function));
    });

    describe('open-file handler', () => {
        it('should return error if file does not exist', async () => {
            const handler = getHandler<OpenFilePayload>('open-file');

            const filePath = '/home/user/Downloads/missing.txt';
            vi.mocked(fs.access).mockRejectedValueOnce(new Error('ENOENT'));

            const result = await handler({}, { filePath });

            expect(result.success).toBe(false);
            expect(result.error).toContain('ya no existe');
            expect(shell.openPath).not.toHaveBeenCalled();
        });

        it('should call shell.openPath if file exists', async () => {
            const handler = getHandler<OpenFilePayload>('open-file');

            const filePath = '/home/user/Downloads/exists.txt';
            vi.mocked(fs.access).mockResolvedValueOnce(undefined);
            vi.mocked(shell.openPath).mockResolvedValueOnce('');

            const result = await handler({}, { filePath });

            expect(result.success).toBe(true);
            expect(shell.openPath).toHaveBeenCalledWith(path.resolve(filePath));
        });

        it('should return error if path is outside restricted directories', async () => {
            const handler = getHandler<OpenFilePayload>('open-file');

            const filePath = '/etc/passwd';
            const result = await handler({}, { filePath });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Acceso denegado');
            expect(shell.openPath).not.toHaveBeenCalled();
        });
    });

    describe('persist-internal-asset handler', () => {
        it('rejects arbitrary renderer-provided paths that were not user selected', async () => {
            const handler = getHandler<PersistPayload>('persist-internal-asset');

            const result = await handler({ sender: { id: 7 } }, { filePath: '/etc/passwd', fileName: 'passwd' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('selección explícita del usuario');
            expect(fs.copyFile).not.toHaveBeenCalled();
        });

        it('allows persisting app-managed temp files', async () => {
            const handler = getHandler<PersistPayload>('persist-internal-asset');

            const result = await handler(
                { sender: { id: 11 } },
                { filePath: '/tmp/upeer-voicemail/audio.ogg', fileName: 'audio.ogg' }
            );

            expect(result.success).toBe(true);
            expect(fs.copyFile).toHaveBeenCalled();
        });

        it('returns the same path when the source is already inside internal assets', async () => {
            const handler = getHandler<PersistPayload>('persist-internal-asset');

            const result = await handler(
                { sender: { id: 12 } },
                { filePath: '/home/user/.config/upeer/assets/existing.pdf', fileName: 'existing.pdf' }
            );

            expect(result).toEqual({ success: true, path: path.resolve('/home/user/.config/upeer/assets/existing.pdf') });
            expect(fs.copyFile).not.toHaveBeenCalled();
        });
    });

    describe('persist-selected-file handler', () => {
        it('rejects arbitrary renderer-provided paths if they were not explicitly trusted', async () => {
            const handler = getHandler<PersistPayload>('persist-selected-file');

            const result = await handler({ sender: { id: 13 } }, { filePath: '/mnt/data/video.mp4', fileName: 'video.mp4' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('selección explícita del usuario');
            expect(fs.copyFile).not.toHaveBeenCalled();
        });

        it('persists a file selected via preload/webUtils path resolution', async () => {
            const registerHandler = getHandler<OpenFilePayload>('register-trusted-selected-file');
            const handler = getHandler<PersistPayload>('persist-selected-file');

            const registration = await registerHandler({ sender: { id: 14 } }, { filePath: '/mnt/data/video.mp4' });
            expect(registration).toEqual({ success: true });

            const result = await handler({ sender: { id: 14 } }, { filePath: '/mnt/data/video.mp4', fileName: 'video.mp4' });

            expect(result.success).toBe(true);
            expect(fs.copyFile).toHaveBeenCalledWith(
                path.resolve('/mnt/data/video.mp4'),
                expect.stringContaining('/home/user/.config/upeer/assets/')
            );
        });
    });

    describe('save-buffer-to-temp handler', () => {
        it('sanitizes file names so they cannot escape the dedicated temp folder', async () => {
            const handler = getHandler<SaveBufferPayload>('save-buffer-to-temp');

            const result = await handler({ sender: { id: 14 } }, { base64: Buffer.from('hola').toString('base64'), fileName: '../../escape.txt' });

            expect(result.success).toBe(true);
            expect(fs.writeFile).toHaveBeenCalledWith('/tmp/upeer-voicemail/escape.txt', expect.any(Buffer));
        });
    });
});
