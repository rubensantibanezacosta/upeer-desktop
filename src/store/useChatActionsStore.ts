import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChatActionPrefs {
    archived: boolean;
    muted: boolean;
    pinned: boolean;
    unread: boolean;
}

export interface MessageActionPrefs {
    pinned: boolean;
    starred: boolean;
    reported: boolean;
}

interface ChatActionsState {
    contactPrefs: Record<string, ChatActionPrefs>;
    groupPrefs: Record<string, ChatActionPrefs>;
    messagePrefs: Record<string, MessageActionPrefs>;
    toggleContact: (id: string, key: keyof ChatActionPrefs) => void;
    toggleGroup: (id: string, key: keyof ChatActionPrefs) => void;
    toggleMessage: (id: string, key: keyof MessageActionPrefs) => void;
    setMessageFlag: (id: string, key: keyof MessageActionPrefs, value: boolean) => void;
    clearChat: (id: string, kind: 'contact' | 'group') => void;
    markAllRead: () => void;
    applyRemoteChat: (chatId: string, values: Record<string, unknown>) => void;
    applyRemoteMessage: (values: Record<string, unknown>) => void;
}

const emptyPrefs: ChatActionPrefs = { archived: false, muted: false, pinned: false, unread: false };
const emptyMessagePrefs: MessageActionPrefs = { pinned: false, starred: false, reported: false };
const CHAT_KEYS: ReadonlyArray<keyof ChatActionPrefs> = ['archived', 'muted', 'pinned', 'unread'];

const isGroupChat = (id: string): boolean => id.startsWith('grp-');

function emitChatFlags(chatId: string, prefs: ChatActionPrefs): void {
    emitSettingsPatch({ block: 'chat', chatId, ...prefs }, 'No se pudieron compartir los ajustes del chat.');
}

function emitMessageFlags(messageId: string, prefs: MessageActionPrefs): void {
    emitSettingsPatch(
        { block: 'message', messageId, starred: prefs.starred, pinned: prefs.pinned },
        'No se pudieron compartir los destacados del mensaje.',
    );
}

function emitSettingsPatch(payload: Record<string, unknown>, message: string): void {
    if (typeof window === 'undefined') return;
    const emit = window.upeer?.emitSettingsPatch;
    if (typeof emit !== 'function') return;
    emit(payload).catch((cause: unknown) => {
        console.warn(message, cause);
    });
}

const toggle = (prefs: Record<string, ChatActionPrefs>, id: string, key: keyof ChatActionPrefs): Record<string, ChatActionPrefs> => {
    const current = prefs[id] || { ...emptyPrefs };
    return { ...prefs, [id]: { ...current, [key]: !current[key] } };
};

const toggleMessage = (prefs: Record<string, MessageActionPrefs>, id: string, key: keyof MessageActionPrefs): Record<string, MessageActionPrefs> => {
    const current = prefs[id] || { ...emptyMessagePrefs };
    return { ...prefs, [id]: { ...current, [key]: !current[key] } };
};

const markRead = (prefs: Record<string, ChatActionPrefs>): Record<string, ChatActionPrefs> =>
    Object.fromEntries(Object.entries(prefs).map(([id, value]) => [id, { ...value, unread: false }]));

export const useChatActionsStore = create<ChatActionsState>()(
    persist(
        (set, get) => ({
            contactPrefs: {},
            groupPrefs: {},
            messagePrefs: {},
            toggleContact: (id, key) => {
                const contactPrefs = toggle(get().contactPrefs, id, key);
                set({ contactPrefs });
                emitChatFlags(id, contactPrefs[id] ?? { ...emptyPrefs });
            },
            toggleGroup: (id, key) => {
                const groupPrefs = toggle(get().groupPrefs, id, key);
                set({ groupPrefs });
                emitChatFlags(id, groupPrefs[id] ?? { ...emptyPrefs });
            },
            toggleMessage: (id, key) => {
                const messagePrefs = toggleMessage(get().messagePrefs, id, key);
                set({ messagePrefs });
                emitMessageFlags(id, messagePrefs[id] ?? { ...emptyMessagePrefs });
            },
            setMessageFlag: (id, key, value) => {
                const current = get().messagePrefs[id] || { ...emptyMessagePrefs };
                if (current[key] === value) return;
                const next = { ...current, [key]: value };
                set({ messagePrefs: { ...get().messagePrefs, [id]: next } });
                emitMessageFlags(id, next);
            },
            clearChat: (id, kind) => {
                const prefs = kind === 'contact' ? get().contactPrefs : get().groupPrefs;
                const next = { ...prefs };
                delete next[id];
                set(kind === 'contact' ? { contactPrefs: next } : { groupPrefs: next });
                emitChatFlags(id, { ...emptyPrefs });
            },
            markAllRead: () => {
                const { contactPrefs, groupPrefs } = get();
                for (const [id, prefs] of Object.entries(contactPrefs)) {
                    if (prefs.unread) emitChatFlags(id, { ...prefs, unread: false });
                }
                for (const [id, prefs] of Object.entries(groupPrefs)) {
                    if (prefs.unread) emitChatFlags(id, { ...prefs, unread: false });
                }
                set({ contactPrefs: markRead(contactPrefs), groupPrefs: markRead(groupPrefs) });
            },
            applyRemoteChat: (chatId, values) => {
                const current = isGroupChat(chatId) ? get().groupPrefs[chatId] : get().contactPrefs[chatId];
                const merged: ChatActionPrefs = { ...(current ?? emptyPrefs) };
                for (const key of CHAT_KEYS) {
                    const candidate = values[key];
                    if (typeof candidate === 'boolean') merged[key] = candidate;
                }
                if (current && CHAT_KEYS.every((key) => current[key] === merged[key])) return;
                if (isGroupChat(chatId)) {
                    set({ groupPrefs: { ...get().groupPrefs, [chatId]: merged } });
                    return;
                }
                set({ contactPrefs: { ...get().contactPrefs, [chatId]: merged } });
            },
            applyRemoteMessage: (values) => {
                const messageId = typeof values.messageId === 'string' ? values.messageId.trim() : '';
                if (!messageId) return;
                const current = get().messagePrefs[messageId] ?? emptyMessagePrefs;
                const merged: MessageActionPrefs = { ...current };
                for (const key of ['starred', 'pinned'] as const) {
                    const candidate = values[key];
                    if (typeof candidate === 'boolean') merged[key] = candidate;
                }
                if (merged.starred === current.starred && merged.pinned === current.pinned) return;
                set({ messagePrefs: { ...get().messagePrefs, [messageId]: merged } });
            },
        }),
        { name: 'chat-actions-prefs' }
    )
);
