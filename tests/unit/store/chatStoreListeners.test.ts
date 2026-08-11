import { beforeEach, describe, expect, it, vi } from 'vitest';

const onReceiveMock = vi.fn();
const refreshContactsMock = vi.fn();
const sendReadReceiptMock = vi.fn();
const getContactsMock = vi.fn();

(globalThis as Record<string, unknown>).window = {
    upeer: {
        onReceive: onReceiveMock,
        sendReadReceipt: sendReadReceiptMock,
        getContacts: getContactsMock,
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
        onTyping: vi.fn(),
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

import { createChatListenerActions } from '../../../src/store/chatStoreListeners.js';
import type { ChatMessage } from '../../../src/types/chat.js';

describe('chatStoreListeners: onReceive con mensaje recuperado del vault', () => {
    beforeEach(() => {
        onReceiveMock.mockReset();
        refreshContactsMock.mockReset();
        sendReadReceiptMock.mockReset();
        (globalThis.window as unknown as { __chat_listeners_initialized?: boolean }).__chat_listeners_initialized = false;
    });

    it('añade el mensaje al historial cuando la conversación está abierta', () => {
        const set = vi.fn((fn: (s: { chatHistory: ChatMessage[] }) => { chatHistory: ChatMessage[] }) => {
            const prev = { chatHistory: [] as ChatMessage[] };
            return fn(prev);
        });
        const get = vi.fn(() => ({ targetUpeerId: 'peer-a', refreshContacts: refreshContactsMock }));
        createChatListenerActions(set as never, get as never).initListeners();

        const handler = onReceiveMock.mock.calls[0][0];
        handler({ id: 'm1', upeerId: 'peer-a', isMine: false, message: 'mensaje vaulteado', timestamp: 1000 });

        expect(set).toHaveBeenCalled();
        const updater = (set.mock.calls[0][0] as (s: { chatHistory: ChatMessage[] }) => { chatHistory: ChatMessage[] });
        const result = updater({ chatHistory: [] });
        expect(result.chatHistory).toHaveLength(1);
        expect(result.chatHistory[0].message).toBe('mensaje vaulteado');
        expect(result.chatHistory[0].upeerId).toBe('peer-a');
    });

    it('no añade al historial si la conversación NO está abierta (solo notifica)', () => {
        const set = vi.fn();
        const get = vi.fn(() => ({ targetUpeerId: 'peer-otro', refreshContacts: refreshContactsMock }));
        createChatListenerActions(set as never, get as never).initListeners();

        const handler = onReceiveMock.mock.calls[0][0];
        handler({ id: 'm1', upeerId: 'peer-a', isMine: false, message: 'mensaje vaulteado', timestamp: 1000 });

        expect(set).not.toHaveBeenCalled();
    });

    it('no duplica un mensaje que ya está en el historial', () => {
        const existing = { id: 'm1' } as ChatMessage;
        const set = vi.fn((fn: (s: { chatHistory: ChatMessage[] }) => { chatHistory: ChatMessage[] }) => {
            return fn({ chatHistory: [existing] });
        });
        const get = vi.fn(() => ({ targetUpeerId: 'peer-a', refreshContacts: refreshContactsMock }));
        createChatListenerActions(set as never, get as never).initListeners();

        const handler = onReceiveMock.mock.calls[0][0];
        handler({ id: 'm1', upeerId: 'peer-a', isMine: false, message: 'dup', timestamp: 1000 });

        expect(set).toHaveBeenCalled();
        const updater = (set.mock.calls[0][0] as (s: { chatHistory: ChatMessage[] }) => { chatHistory: ChatMessage[] });
        const result = updater({ chatHistory: [existing] });
        expect(result.chatHistory).toHaveLength(1);
    });
});
