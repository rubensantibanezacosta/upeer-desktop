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
            getPath: vi.fn().mockReturnValue('/home/user'),
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
    });

    it('should register open-file handler', () => {
        expect(ipcMain.handle).toHaveBeenCalledWith('open-file', expect.any(Function));
    });

    describe('open-file handler', () => {
        it('should return error if file does not exist', async () => {
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'open-file')[1];
            
            const filePath = '/home/user/missing.txt';
            (fs.access as any).mockRejectedValueOnce(new Error('ENOENT'));

            const result = await handler({}, { filePath });

            expect(result.success).toBe(false);
            expect(result.error).toContain('ya no existe');
            expect(shell.openPath).not.toHaveBeenCalled();
        });

        it('should call shell.openPath if file exists', async () => {
            const handler = (ipcMain.handle as any).mock.calls.find((call: any) => call[0] === 'open-file')[1];
            
            const filePath = '/home/user/exists.txt';
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
});
