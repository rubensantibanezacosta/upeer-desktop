import { beforeEach, describe, expect, it, vi } from 'vitest';

const onReceiveMock = vi.fn();
const onPresenceMock = vi.fn();
const refreshContactsMock = vi.fn();
const sendReadReceiptMock = vi.fn();
const getContactsMock = vi.fn();
const { playNotificationSoundMock, chatActionState } = vi.hoisted(() => ({
    playNotificationSoundMock: vi.fn(),
    chatActionState: { groupPrefs: {} as Record<string, { muted?: boolean }> },
}));

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
        onPresence: onPresenceMock,
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
vi.mock('../../../src/utils/notificationSound.js', () => ({ playNotificationSound: playNotificationSoundMock }));
vi.mock('../../../src/store/useChatActionsStore.js', () => ({ useChatActionsStore: { getState: () => chatActionState } }));

import { createChatListenerActions } from '../../../src/store/chatStoreListeners.js';
import type { ChatMessage } from '../../../src/types/chat.js';

describe('chatStoreListeners: onReceive con mensaje recuperado del vault', () => {
    beforeEach(() => {
        onReceiveMock.mockReset();
        onPresenceMock.mockReset();
        refreshContactsMock.mockReset();
        sendReadReceiptMock.mockReset();
        playNotificationSoundMock.mockReset();
        chatActionState.groupPrefs = {};
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

    it('inserta un adjunto (mensaje file del vault) cuando la conversación está abierta', () => {
        const fileMessage = JSON.stringify({
            type: 'file',
            transferId: 'f1',
            fileName: 'video.mp4',
            fileSize: 4096,
            mimeType: 'video/mp4',
            fileHash: 'h'.repeat(64),
            direction: 'receiving',
            state: 'active',
        });
        const set = vi.fn((fn: (s: { chatHistory: ChatMessage[] }) => { chatHistory: ChatMessage[] }) => {
            return fn({ chatHistory: [] });
        });
        const get = vi.fn(() => ({ targetUpeerId: 'peer-a', refreshContacts: refreshContactsMock }));
        createChatListenerActions(set as never, get as never).initListeners();

        const handler = onReceiveMock.mock.calls[0][0];
        handler({ id: 'file-1', upeerId: 'peer-a', isMine: false, message: fileMessage, timestamp: 2000 });

        expect(set).toHaveBeenCalled();
        const updater = (set.mock.calls[0][0] as (s: { chatHistory: ChatMessage[] }) => { chatHistory: ChatMessage[] });
        const result = updater({ chatHistory: [] });
        expect(result.chatHistory).toHaveLength(1);
        expect(result.chatHistory[0].message).toBe(fileMessage);
    });

    it('no reproduce sonido para un grupo silenciado', () => {
        chatActionState.groupPrefs = { 'group-muted': { muted: true } };
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        const onGroupMessageMock = (globalThis.window as unknown as { upeer: { onGroupMessage: ReturnType<typeof vi.fn> } }).upeer.onGroupMessage;
        const set = vi.fn();
        const get = vi.fn(() => ({ activeGroupId: '', contacts: [], myIdentity: undefined, refreshGroups: vi.fn() }));
        createChatListenerActions(set as never, get as never).initListeners();

        const handler = onGroupMessageMock.mock.calls.at(-1)?.[0];
        handler({ groupId: 'group-muted', message: 'mensaje', isMine: false, timestamp: 1000 });

        expect(playNotificationSoundMock).not.toHaveBeenCalled();
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    });

    it('reproduce sonido para un grupo no silenciado cuando la ventana está oculta', () => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        const onGroupMessageMock = (globalThis.window as unknown as { upeer: { onGroupMessage: ReturnType<typeof vi.fn> } }).upeer.onGroupMessage;
        const set = vi.fn();
        const get = vi.fn(() => ({ activeGroupId: '', contacts: [], myIdentity: undefined, refreshGroups: vi.fn() }));
        createChatListenerActions(set as never, get as never).initListeners();

        const handler = onGroupMessageMock.mock.calls.at(-1)?.[0];
        handler({ groupId: 'group-unmuted', message: 'mensaje', isMine: false, timestamp: 1000 });

        expect(playNotificationSoundMock).toHaveBeenCalledOnce();
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    });

    it('actualiza lastActive sin borrar lastSeen cuando llega un PING con actividad', () => {
        const set = vi.fn((fn: (s: { contacts: Record<string, unknown>[] }) => { contacts: Record<string, unknown>[] }) => fn({
            contacts: [{ upeerId: 'peer-a', lastSeen: '2026-01-01T10:00:00.000Z', lastActive: '2026-01-01T10:00:00.000Z' }],
        }));
        const get = vi.fn(() => ({ targetUpeerId: 'peer-a', refreshContacts: refreshContactsMock }));
        createChatListenerActions(set as never, get as never).initListeners();

        const handler = onPresenceMock.mock.calls[0][0];
        handler({ upeerId: 'peer-a', lastActive: '2026-01-01T12:00:00.000Z' });

        const next = (set.mock.calls[0][0] as (s: unknown) => { contacts: Record<string, unknown>[] })({
            contacts: [{ upeerId: 'peer-a', lastSeen: '2026-01-01T10:00:00.000Z', lastActive: '2026-01-01T10:00:00.000Z' }],
        });
        expect(next.contacts[0]).toMatchObject({
            lastSeen: '2026-01-01T10:00:00.000Z',
            lastActive: '2026-01-01T12:00:00.000Z',
        });
    });

    it('no toca la presencia cuando el evento solo trae datos de perfil', () => {
        const set = vi.fn((fn: (s: { contacts: Record<string, unknown>[] }) => { contacts: Record<string, unknown>[] }) => fn({
            contacts: [{ upeerId: 'peer-a', lastSeen: '2026-01-01T10:00:00.000Z', lastActive: '2026-01-01T10:00:00.000Z' }],
        }));
        const get = vi.fn(() => ({ targetUpeerId: 'peer-a', refreshContacts: refreshContactsMock }));
        createChatListenerActions(set as never, get as never).initListeners();

        const handler = onPresenceMock.mock.calls[0][0];
        handler({ upeerId: 'peer-a', alias: 'Alice' });

        const next = (set.mock.calls[0][0] as (s: unknown) => { contacts: Record<string, unknown>[] })({
            contacts: [{ upeerId: 'peer-a', lastSeen: '2026-01-01T10:00:00.000Z', lastActive: '2026-01-01T10:00:00.000Z' }],
        });
        expect(next.contacts[0]).toMatchObject({
            lastSeen: '2026-01-01T10:00:00.000Z',
            lastActive: '2026-01-01T10:00:00.000Z',
        });
    });

    it('ignora eventos sin upeerId', () => {
        const set = vi.fn();
        const get = vi.fn(() => ({ targetUpeerId: 'peer-a', refreshContacts: refreshContactsMock }));
        createChatListenerActions(set as never, get as never).initListeners();

        onPresenceMock.mock.calls[0][0]({ lastActive: '2026-01-01T12:00:00.000Z' });
        expect(set).not.toHaveBeenCalled();
    });
});
