import { beforeEach, describe, expect, it, vi } from 'vitest';

const windowMocks = vi.hoisted(() => ({
    mainWindow: null as null | {
        isDestroyed: () => boolean;
        webContents: {
            isDestroyed: () => boolean;
            isLoadingMainFrame: () => boolean;
            mainFrame: { isDestroyed: () => boolean };
            send: ReturnType<typeof vi.fn>;
        };
    },
}));

vi.mock('../../../src/main_process/core/windowManager.js', () => ({
    getMainWindow: vi.fn(() => windowMocks.mainWindow),
}));

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({ warn: vi.fn() }));

import { beginVaultRecoverySource, completeVaultRecoverySource } from '../../../src/main_process/network/vault/recoveryTracker.js';

describe('vault recovery tracker renderer delivery', () => {
    const getRenderer = () => {
        if (!windowMocks.mainWindow) {
            throw new Error('Main window mock is not initialized');
        }
        return windowMocks.mainWindow.webContents;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        windowMocks.mainWindow = {
            isDestroyed: vi.fn(() => false),
            webContents: {
                isDestroyed: vi.fn(() => false),
                isLoadingMainFrame: vi.fn(() => false),
                mainFrame: { isDestroyed: vi.fn(() => false) },
                send: vi.fn(),
            },
        };
    });

    it('does not send status while the main frame is loading', () => {
        const source = 'recovery-frame-loading';
        vi.mocked(getRenderer().isLoadingMainFrame).mockReturnValue(true);

        beginVaultRecoverySource(source, 'test');
        completeVaultRecoverySource(source);

        expect(getRenderer().send).not.toHaveBeenCalled();
    });

    it('does not send status to destroyed webContents', () => {
        const source = 'recovery-webcontents-destroyed';
        vi.mocked(getRenderer().isDestroyed).mockReturnValue(true);

        beginVaultRecoverySource(source, 'test');
        completeVaultRecoverySource(source);

        expect(getRenderer().send).not.toHaveBeenCalled();
    });

    it('does not send status to a destroyed main frame', () => {
        const source = 'recovery-main-frame-destroyed';
        vi.mocked(getRenderer().mainFrame.isDestroyed).mockReturnValue(true);

        beginVaultRecoverySource(source, 'test');
        completeVaultRecoverySource(source);

        expect(getRenderer().send).not.toHaveBeenCalled();
    });
});