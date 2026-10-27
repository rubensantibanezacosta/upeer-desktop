import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationActivity } from '../../../src/types/chat.js';

const onTypingMock = vi.fn();

(globalThis as Record<string, unknown>).window = {
    upeer: {
        onReceive: vi.fn(),
        sendReadReceipt: vi.fn(),
        getContacts: vi.fn(),
        onContactRequest: vi.fn(),
        onGroupMessage: vi.fn(),
        onGroupInvite: vi.fn(),
        onGroupUpdated: vi.fn(),
        onGroupMessageDelivered: vi.fn(),
        onMessageDelivered: vi.fn(),
        onMessageRead: vi.fn(),
        onMessageUpdated: vi.fn(),
        onMessageDeleted: vi.fn(),
        onMessageReactionUpdated: vi.fn(),
        onMessageStatusUpdated: vi.fn(),
        onTyping: onTypingMock,
        onPresence: vi.fn(),
        onKeyChangeAlert: vi.fn(),
        onContactUntrustworthy: vi.fn(),
        onChatCleared: vi.fn(),
        onFocusConversation: vi.fn(),
        onHandshakeFinished: vi.fn(),
        onReputationUpdated: vi.fn(),
    },
    document: { hidden: false },
} as never;

vi.mock('../../../src/store/usePrivacyStore.js', () => ({ usePrivacyStore: { getState: () => ({ readReceipts: true }) } }));
vi.mock('../../../src/store/useNavigationStore.js', () => ({ useNavigationStore: { getState: () => ({}) } }));
vi.mock('../../../src/store/useNotificationStore.js', () => ({ useNotificationStore: { getState: () => ({ msgNotif: true, sound: true }) } }));
vi.mock('../../../src/utils/notificationSound.js', () => ({ playNotificationSound: vi.fn() }));
vi.mock('../../../src/store/useChatActionsStore.js', () => ({ useChatActionsStore: { getState: () => ({ groupPrefs: {} }) } }));

import { createChatListenerActions } from '../../../src/store/chatStoreListeners.js';

interface ActivityState {
    typingStatus: Record<string, unknown>;
    peerActivity: Record<string, ConversationActivity>;
}

const emptyState = (): ActivityState => ({ typingStatus: {}, peerActivity: {} });

const initActivityListener = (baseState: ActivityState = emptyState()) => {
    let state = baseState;
    const set = vi.fn((updater: ((current: ActivityState) => ActivityState) | Partial<ActivityState>) => {
        state = typeof updater === 'function' ? updater(state) : { ...state, ...updater };
    });
    const get = vi.fn(() => ({ targetUpeerId: 'peer-a', refreshContacts: vi.fn() }));
    createChatListenerActions(set as never, get as never).initListeners();
    const handler = onTypingMock.mock.calls.at(-1)?.[0] as (data: { upeerId: string; groupId?: string; state?: string }) => void;
    return { handler, read: () => state };
};

describe('chatStoreListeners: actividad de conversación', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        onTypingMock.mockReset();
        (globalThis.window as unknown as { __chat_listeners_initialized?: boolean }).__chat_listeners_initialized = false;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('marca al contacto como escribiendo', () => {
        const { handler, read } = initActivityListener();

        handler({ upeerId: 'peer-a' });

        const state = read();
        expect(state.peerActivity['peer-a']).toBe('typing');
        expect(state.typingStatus['peer-a']).toBeDefined();
    });

    it('marca al contacto como grabando audio', () => {
        const { handler, read } = initActivityListener();

        handler({ upeerId: 'peer-a', state: 'recording' });

        expect(read().peerActivity['peer-a']).toBe('recording');
    });

    it('usa el grupo como clave cuando la actividad llega de un grupo', () => {
        const { handler, read } = initActivityListener();

        handler({ upeerId: 'sender-1', groupId: 'grp-1', state: 'recording' });

        const state = read();
        expect(state.peerActivity['grp-1']).toBe('recording');
        expect(state.peerActivity['sender-1']).toBeUndefined();
    });

    it('limpia la actividad cuando llega la señal de parada', () => {
        const baseState: ActivityState = {
            typingStatus: { 'peer-a': setTimeout(() => undefined, 5000) },
            peerActivity: { 'peer-a': 'recording' },
        };
        const { handler, read } = initActivityListener(baseState);

        handler({ upeerId: 'peer-a', state: 'stop' });

        const state = read();
        expect(state.peerActivity['peer-a']).toBeUndefined();
        expect(state.typingStatus['peer-a']).toBeUndefined();
    });

    it('expira la actividad cuando dejan de llegar señales', () => {
        const { handler, read } = initActivityListener();
        handler({ upeerId: 'peer-a' });

        vi.advanceTimersByTime(4000);

        const state = read();
        expect(state.peerActivity['peer-a']).toBeUndefined();
        expect(state.typingStatus['peer-a']).toBeUndefined();
    });
});
