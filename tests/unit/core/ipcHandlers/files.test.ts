import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain, shell } from 'electron';
import { registerFileHandlers } from '../../../../src/main_process/core/ipcHandlers/files.js';
import fs from 'node:fs/promises';
import path from 'node:path';

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
        (fs.stat as any).mockResolvedValue({
            size: 1024,
            mtimeMs: 123,
            isFile: () => true,
        });
        (fs.mkdir as any).mockResolvedValue(undefined);
        (fs.writeFile as any).mockResolvedValue(undefined);
        (fs.copyFile as any).mockResolvedValue(undefined);
    });

    it('should register open-file handler', () => {
        expect(ipcMain.handle).toHaveBeenCalledWith('open-file', expect.any(Function));
    });

    describe('open-file handler', () => {
        it('should return error if file does not exist', async () => {
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'open-file')[1];

            const filePath = '/home/user/Downloads/missing.txt';
            (fs.access as any).mockRejectedValueOnce(new Error('ENOENT'));

            const result = await handler({}, { filePath });

            expect(result.success).toBe(false);
            expect(result.error).toContain('ya no existe');
            expect(shell.openPath).not.toHaveBeenCalled();
        });

        it('should call shell.openPath if file exists', async () => {
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'open-file')[1];

            const filePath = '/home/user/Downloads/exists.txt';
            (fs.access as any).mockResolvedValueOnce(undefined);
            (shell.openPath as any).mockResolvedValueOnce('');

            const result = await handler({}, { filePath });

            expect(result.success).toBe(true);
            expect(shell.openPath).toHaveBeenCalledWith(path.resolve(filePath));
        });

        it('should return error if path is outside restricted directories', async () => {
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'open-file')[1];

            const filePath = '/etc/passwd';
            const result = await handler({}, { filePath });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Acceso denegado');
            expect(shell.openPath).not.toHaveBeenCalled();
        });
    });

    describe('persist-internal-asset handler', () => {
        it('rejects arbitrary renderer-provided paths that were not user selected', async () => {
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'persist-internal-asset')[1];

            const result = await handler({ sender: { id: 7 } }, { filePath: '/etc/passwd', fileName: 'passwd' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('selección explícita del usuario');
            expect(fs.copyFile).not.toHaveBeenCalled();
        });

        it('allows persisting app-managed temp files', async () => {
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'persist-internal-asset')[1];

            const result = await handler(
                { sender: { id: 11 } },
                { filePath: '/tmp/upeer-voicemail/audio.ogg', fileName: 'audio.ogg' }
            );

            expect(result.success).toBe(true);
            expect(fs.copyFile).toHaveBeenCalled();
        });

        it('returns the same path when the source is already inside internal assets', async () => {
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'persist-internal-asset')[1];

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
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'persist-selected-file')[1];

            const result = await handler({ sender: { id: 13 } }, { filePath: '/mnt/data/video.mp4', fileName: 'video.mp4' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('selección explícita del usuario');
            expect(fs.copyFile).not.toHaveBeenCalled();
        });

        it('persists a file selected via preload/webUtils path resolution', async () => {
            const registerHandler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'register-trusted-selected-file')[1];
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'persist-selected-file')[1];

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
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'save-buffer-to-temp')[1];

            const result = await handler({ sender: { id: 14 } }, { base64: Buffer.from('hola').toString('base64'), fileName: '../../escape.txt' });

            expect(result.success).toBe(true);
            expect(fs.writeFile).toHaveBeenCalledWith('/tmp/upeer-voicemail/escape.txt', expect.any(Buffer));
        });
    });
});
