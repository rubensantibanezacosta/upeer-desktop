import type { ConversationActivitySignal } from '../types/chat.js';

export const TYPING_WINDOW_MS = 2000;

export const createTypingThrottle = (now: () => number = () => Date.now()) => {
    let lastConversationId = '';
    let lastSentAt = 0;

    return (conversationId: string, state: ConversationActivitySignal): boolean => {
        if (state !== 'typing') {
            lastConversationId = conversationId;
            lastSentAt = now() - TYPING_WINDOW_MS;
            return true;
        }
        const current = now();
        if (conversationId !== lastConversationId) {
            lastConversationId = conversationId;
            lastSentAt = current;
            return true;
        }
        if (current - lastSentAt < TYPING_WINDOW_MS) {
            return false;
        }
        lastSentAt = current;
        return true;
    };
};
