import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerSecurityHandlers } from '../../../src/main_process/core/ipcHandlers/security.js';
import * as pinLogic from '../../../src/main_process/security/pin.js';

// Mock de Electron y la lógica de PIN
vi.mock('electron', () => ({
    ipcMain: {
        handle: vi.fn(),
    },
}));

vi.mock('../../../src/main_process/security/pin.js', () => ({
    setAccessPin: vi.fn(),
    verifyAccessPin: vi.fn(),
    disableAccessPin: vi.fn(),
    isPinEnabled: vi.fn(),
}));

describe('IPC Security Handlers (Bridge Layer Integration)', () => {
    let handlers: Record<string, (event: any, ...args: any[]) => any> = {};

    beforeEach(() => {
        vi.clearAllMocks();
        handlers = {};
        // Capturar los handlers que se registran
        (ipcMain.handle as any).mockImplementation((channel: string, callback: (event: any, ...args: any[]) => any) => {
            handlers[channel] = callback;
        });
        registerSecurityHandlers();
    });

    it('should correctly extract pin from object in verify-pin (Frontend Integration Fix)', async () => {
        const verifySpy = vi.spyOn(pinLogic, 'verifyAccessPin');

        // Simular lo que envía el bridge cuando el frontend manda un objeto
        // Este es el escenario que fallaba con "Received an instance of Object"
        await handlers['verify-pin']({}, { pin: '1234' });

        expect(verifySpy).toHaveBeenCalledWith('1234');
        expect(typeof verifySpy.mock.calls[0][0]).toBe('string');
    });

    it('should correctly extract pins from object in set-pin', async () => {
        const setSpy = vi.spyOn(pinLogic, 'setAccessPin');
        const verifySpy = vi.spyOn(pinLogic, 'verifyAccessPin').mockReturnValue(true);
        vi.spyOn(pinLogic, 'isPinEnabled').mockReturnValue(true);

        await handlers['set-pin']({}, { currentPin: '1111', newPin: '2222' });

        expect(verifySpy).toHaveBeenCalledWith('1111');
        expect(setSpy).toHaveBeenCalledWith('2222');
        expect(typeof setSpy.mock.calls[0][0]).toBe('string');
    });

    it('should NOT handle direct string arguments in verify-pin anymore (Strict Mode)', async () => {
        const verifySpy = vi.spyOn(pinLogic, 'verifyAccessPin');

        const result = await handlers['verify-pin']({}, '5555');

        expect(result).toBe(false);
        expect(verifySpy).not.toHaveBeenCalled();
    });

    it('should handle disable-pin with wrapped object', async () => {
        const disableSpy = vi.spyOn(pinLogic, 'disableAccessPin');

        await handlers['disable-pin']({}, { pin: '1234' });

        expect(disableSpy).toHaveBeenCalledWith('1234');
        expect(typeof disableSpy.mock.calls[0][0]).toBe('string');
    });
});
