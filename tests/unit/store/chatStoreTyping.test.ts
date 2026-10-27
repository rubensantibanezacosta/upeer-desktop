import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendTypingIndicator = vi.fn();

(globalThis as Record<string, unknown>).window = {
    upeer: { sendTypingIndicator },
} as never;

import { createChatOperationActions } from '../../../src/store/chatStoreOperations.js';

const createActions = (targetUpeerId: string) => {
    const set = vi.fn();
    const get = vi.fn(() => ({ targetUpeerId, activeGroupId: '' }));
    return { actions: createChatOperationActions(set as never, get as never), set };
};

describe('chatStoreOperations: handleTyping', () => {
    beforeEach(() => {
        sendTypingIndicator.mockReset();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-27T10:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('agrupa las pulsaciones rápidas en un solo paquete', () => {
        const { actions } = createActions('peer-rapido');

        actions.handleTyping('typing');
        vi.advanceTimersByTime(200);
        actions.handleTyping('typing');
        vi.advanceTimersByTime(200);
        actions.handleTyping('typing');

        expect(sendTypingIndicator).toHaveBeenCalledTimes(1);
        expect(sendTypingIndicator).toHaveBeenCalledWith('peer-rapido', 'typing');
    });

    it('reenvía cuando pasa la ventana para no perder el indicador', () => {
        const { actions } = createActions('peer-ventana');

        actions.handleTyping('typing');
        vi.advanceTimersByTime(2100);
        actions.handleTyping('typing');

        expect(sendTypingIndicator).toHaveBeenCalledTimes(2);
    });

    it('manda la grabación y la parada sin esperar', () => {
        const { actions } = createActions('peer-voz');

        actions.handleTyping('typing');
        actions.handleTyping('recording');
        expect(sendTypingIndicator).toHaveBeenCalledTimes(2);
        actions.handleTyping('stop');
        expect(sendTypingIndicator).toHaveBeenCalledTimes(3);
        expect(sendTypingIndicator).toHaveBeenLastCalledWith('peer-voz', 'stop');
    });

    it('no envía nada sin conversación abierta', () => {
        const { actions } = createActions('');

        actions.handleTyping('typing');

        expect(sendTypingIndicator).not.toHaveBeenCalled();
    });
});
