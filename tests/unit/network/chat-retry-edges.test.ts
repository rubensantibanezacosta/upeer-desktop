import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    warn: vi.fn(),
}));

vi.mock('../../../src/main_process/network/messaging/chatDirectDelivery.js', () => ({
    resendPendingDirectMessage: vi.fn(),
}));

describe('chatRetry edge cases', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        const { resetPendingDirectMessages } = await import('../../../src/main_process/network/messaging/chatRetry.js');
        resetPendingDirectMessages();
    });

    it('continúa con mensajes posteriores si un reintento falla', async () => {
        const retry = await import('../../../src/main_process/network/messaging/chatRetry.js');
        const directDelivery = await import('../../../src/main_process/network/messaging/chatDirectDelivery.js');
        const logger = await import('../../../src/main_process/security/secure-logger.js');

        retry.registerPendingDirectMessage({
            messageId: 'msg-older',
            upeerId: 'peer-a',
            payload: 'older',
            knownAddresses: ['200::1'],
            timestamp: 100,
        });
        retry.registerPendingDirectMessage({
            messageId: 'msg-newer',
            upeerId: 'peer-a',
            payload: 'newer',
            knownAddresses: ['200::2'],
            timestamp: 200,
        });

        vi.mocked(directDelivery.resendPendingDirectMessage)
            .mockRejectedValueOnce(new Error('network-down'))
            .mockResolvedValueOnce({ id: 'msg-newer', savedMessage: 'newer', timestamp: 200 });

        const retried = await retry.retryPendingDirectMessages('peer-a');

        expect(retried).toBe(1);
        expect(directDelivery.resendPendingDirectMessage).toHaveBeenNthCalledWith(1, 'peer-a', 'older', ['200::1'], undefined, 'msg-older', 100);
        expect(directDelivery.resendPendingDirectMessage).toHaveBeenNthCalledWith(2, 'peer-a', 'newer', ['200::2'], undefined, 'msg-newer', 200);
        expect(logger.warn).toHaveBeenCalledWith(
            'Failed to retry pending direct message after DR_RESET',
            expect.objectContaining({ upeerId: 'peer-a', messageId: 'msg-older', err: 'Error: network-down' }),
            'security'
        );
    });

    it('bloquea reintentos concurrentes del mismo peer', async () => {
        const retry = await import('../../../src/main_process/network/messaging/chatRetry.js');
        const directDelivery = await import('../../../src/main_process/network/messaging/chatDirectDelivery.js');

        retry.registerPendingDirectMessage({
            messageId: 'msg-1',
            upeerId: 'peer-b',
            payload: 'payload',
            knownAddresses: ['200::9'],
            timestamp: 300,
        });

        vi.mocked(directDelivery.resendPendingDirectMessage).mockImplementationOnce(async () => {
            const nestedRetry = await retry.retryPendingDirectMessages('peer-b');
            expect(nestedRetry).toBe(0);
            return { id: 'msg-1', savedMessage: 'payload', timestamp: 300 };
        });

        const firstRetry = await retry.retryPendingDirectMessages('peer-b');

        expect(firstRetry).toBe(1);
        expect(directDelivery.resendPendingDirectMessage).toHaveBeenCalledTimes(1);
    });
});
