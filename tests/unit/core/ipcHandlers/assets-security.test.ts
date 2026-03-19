import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerFileHandlers } from '../../../../src/main_process/core/ipcHandlers/files.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

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
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'persist-internal-asset')[1];
            
            const sourcePath = '/home/user/external-file.jpg';
            const fileName = 'test.jpg';
            
            (fsSync.existsSync as any).mockReturnValue(true);
            (fs.copyFile as any).mockResolvedValue(undefined);

            const result = await handler({}, { filePath: sourcePath, fileName });

            expect(result.success).toBe(true);
            expect(result.path).toContain('/data/user/assets/');
            expect(result.path).toContain('.jpg');
            expect(fs.copyFile).toHaveBeenCalledWith(path.resolve(sourcePath), result.path);
        });

        it('should create assets directory if it does not exist', async () => {
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'persist-internal-asset')[1];
            
            (fsSync.existsSync as any).mockReturnValue(false);
            (fs.mkdir as any).mockResolvedValue(undefined);
            (fs.copyFile as any).mockResolvedValue(undefined);

            await handler({}, { filePath: '/some/path', fileName: 'file.txt' });

            expect(fs.mkdir).toHaveBeenCalledWith('/data/user/assets', { recursive: true });
        });
    });

    describe('open-file security policy', () => {
        it('should allow opening files from assets directory', async () => {
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'open-file')[1];
            
            const assetPath = '/data/user/assets/123-file.jpg';
            (fs.access as any).mockResolvedValue(undefined); // exists
            const { shell } = await import('electron');

            const result = await handler({}, { filePath: assetPath });

            expect(result.success).toBe(true);
            expect(shell.openPath).toHaveBeenCalled();
        });

        it('should deny opening sensitive system files', async () => {
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'open-file')[1];
            
            const sensitivePath = '/etc/shadow';
            const result = await handler({}, { filePath: sensitivePath });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Acceso denegado');
            const { shell } = await import('electron');
            expect(shell.openPath).not.toHaveBeenCalled();
        });

        it('should allow opening files from downloads directory', async () => {
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'open-file')[1];
            
            const downloadPath = '/home/user/Downloads/received.pdf';
            (fs.access as any).mockResolvedValue(undefined);

            const result = await handler({}, { filePath: downloadPath });

            expect(result.success).toBe(true);
        });
    });
});
