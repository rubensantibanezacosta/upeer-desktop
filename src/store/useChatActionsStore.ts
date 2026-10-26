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
    clearChat: (id: string, kind: 'contact' | 'group') => void;
    markAllRead: () => void;
}

const emptyPrefs: ChatActionPrefs = { archived: false, muted: false, pinned: false, unread: false };
const emptyMessagePrefs: MessageActionPrefs = { pinned: false, starred: false, reported: false };

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
        (set) => ({
            contactPrefs: {},
            groupPrefs: {},
            messagePrefs: {},
            toggleContact: (id, key) => set((state) => ({ contactPrefs: toggle(state.contactPrefs, id, key) })),
            toggleGroup: (id, key) => set((state) => ({ groupPrefs: toggle(state.groupPrefs, id, key) })),
            toggleMessage: (id, key) => set((state) => ({ messagePrefs: toggleMessage(state.messagePrefs, id, key) })),
            clearChat: (id, kind) => set((state) => {
                const prefs = kind === 'contact' ? state.contactPrefs : state.groupPrefs;
                const next = { ...prefs };
                delete next[id];
                return kind === 'contact' ? { contactPrefs: next } : { groupPrefs: next };
            }),
            markAllRead: () => set((state) => ({
                contactPrefs: markRead(state.contactPrefs),
                groupPrefs: markRead(state.groupPrefs),
            })),
        }),
        { name: 'chat-actions-prefs' }
    )
);
