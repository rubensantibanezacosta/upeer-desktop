import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/groups/operations.js', () => ({
    getGroupById: vi.fn(() => ({ status: 'active' })),
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

    it('retries and removes only operations belonging to the requested group', async () => {
        const retryModule = await import('../../../src/main_process/network/messaging/encryptedOperationRetry.js');
        const requestedGroupRetry = vi.fn().mockResolvedValue(undefined);
        const otherGroupRetry = vi.fn().mockResolvedValue(undefined);

        retryModule.registerEncryptedOperationRetry('peer-a', 'group:group-a:invite:1', requestedGroupRetry);
        retryModule.registerEncryptedOperationRetry('peer-a', 'group:group-b:invite:1', otherGroupRetry);

        const retried = await retryModule.retryPendingGroupEncryptedOperations('peer-a', 'group-a');
        const otherRetried = await retryModule.retryPendingGroupEncryptedOperations('peer-a', 'group-b');

        expect(retried).toBe(1);
        expect(otherRetried).toBe(1);
        expect(requestedGroupRetry).toHaveBeenCalledOnce();
        expect(otherGroupRetry).toHaveBeenCalledOnce();
    });

    it('clears stale pending operations for a group when its sender key rotates', async () => {
        const retryModule = await import('../../../src/main_process/network/messaging/encryptedOperationRetry.js');
        const removedGroupRetry = vi.fn().mockResolvedValue(undefined);
        const retainedGroupRetry = vi.fn().mockResolvedValue(undefined);

        retryModule.registerEncryptedOperationRetry('peer-a', 'group:group-a:invite:1', removedGroupRetry);
        retryModule.registerEncryptedOperationRetry('peer-a', 'group:group-b:invite:1', retainedGroupRetry);

        expect(retryModule.clearPendingGroupEncryptedOperations('peer-a', 'group-a')).toBe(1);
        expect(await retryModule.retryPendingGroupEncryptedOperations('peer-a', 'group-b')).toBe(1);
        expect(removedGroupRetry).not.toHaveBeenCalled();
        expect(retainedGroupRetry).toHaveBeenCalledOnce();
    });

    it('does not retry pending encrypted group operations after removal', async () => {
        const retryModule = await import('../../../src/main_process/network/messaging/encryptedOperationRetry.js');
        const groupsOps = await import('../../../src/main_process/storage/groups/operations.js');
        const staleRetry = vi.fn().mockResolvedValue(undefined);
        retryModule.registerEncryptedOperationRetry('peer-a', 'group:group-a:update:1:peer-a', staleRetry);
        vi.mocked(groupsOps.getGroupById).mockReturnValue({ status: 'removed' } as never);

        const retried = await retryModule.retryPendingGroupEncryptedOperations('peer-a', 'group-a');

        expect(retried).toBe(0);
        expect(staleRetry).not.toHaveBeenCalled();
        vi.mocked(groupsOps.getGroupById).mockReturnValue({ status: 'active' } as never);
        expect(await retryModule.retryPendingGroupEncryptedOperations('peer-a', 'group-a')).toBe(0);
        expect(staleRetry).not.toHaveBeenCalled();
    });
});
