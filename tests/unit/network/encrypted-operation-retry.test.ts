import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
}));

describe('encryptedOperationRetry', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        const retryModule = await import('../../../src/main_process/network/messaging/encryptedOperationRetry.js');
        retryModule.resetEncryptedOperationRetries();
    });

    it('conserva la operación pendiente si el primer retry falla y la reintenta después', async () => {
        const logger = await import('../../../src/main_process/security/secure-logger.js');
        const retryModule = await import('../../../src/main_process/network/messaging/encryptedOperationRetry.js');

        const retryFn = vi.fn()
            .mockRejectedValueOnce(new Error('temporary-failure'))
            .mockResolvedValueOnce(undefined);

        retryModule.registerEncryptedOperationRetry('peer-a', 'chat-update:1', retryFn, 60_000);

        const firstAttempt = await retryModule.retryPendingEncryptedOperations('peer-a');
        const secondAttempt = await retryModule.retryPendingEncryptedOperations('peer-a');

        expect(firstAttempt).toBe(0);
        expect(secondAttempt).toBe(1);
        expect(retryFn).toHaveBeenCalledTimes(2);
        expect(logger.warn).toHaveBeenCalledWith(
            'Failed to retry encrypted operation after DR_RESET',
            expect.objectContaining({ upeerId: 'peer-a', key: 'chat-update:1' }),
            'security'
        );
    });

    it('descarta la operación si ya expiró', async () => {
        const retryModule = await import('../../../src/main_process/network/messaging/encryptedOperationRetry.js');

        const retryFn = vi.fn().mockResolvedValue(undefined);
        retryModule.registerEncryptedOperationRetry('peer-a', 'expired-op', retryFn, -1);

        const retried = await retryModule.retryPendingEncryptedOperations('peer-a');
        const secondPass = await retryModule.retryPendingEncryptedOperations('peer-a');

        expect(retried).toBe(0);
        expect(secondPass).toBe(0);
        expect(retryFn).not.toHaveBeenCalled();
    });
});
