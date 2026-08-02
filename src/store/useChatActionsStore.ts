import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ChatActionPrefs {
    archived: boolean;
    muted: boolean;
    pinned: boolean;
    unread: boolean;
}

interface ChatActionsState {
    contactPrefs: Record<string, ChatActionPrefs>;
    groupPrefs: Record<string, ChatActionPrefs>;
    toggleContact: (id: string, key: keyof ChatActionPrefs) => void;
    toggleGroup: (id: string, key: keyof ChatActionPrefs) => void;
    clearChat: (id: string, kind: 'contact' | 'group') => void;
}

const emptyPrefs: ChatActionPrefs = { archived: false, muted: false, pinned: false, unread: false };

const toggle = (prefs: Record<string, ChatActionPrefs>, id: string, key: keyof ChatActionPrefs): Record<string, ChatActionPrefs> => {
    const current = prefs[id] || { ...emptyPrefs };
    return { ...prefs, [id]: { ...current, [key]: !current[key] } };
};

export const useChatActionsStore = create<ChatActionsState>()(
    persist(
        (set) => ({
            contactPrefs: {},
            groupPrefs: {},
            toggleContact: (id, key) => set((state) => ({ contactPrefs: toggle(state.contactPrefs, id, key) })),
            toggleGroup: (id, key) => set((state) => ({ groupPrefs: toggle(state.groupPrefs, id, key) })),
            clearChat: (id, kind) => set((state) => {
                const prefs = kind === 'contact' ? state.contactPrefs : state.groupPrefs;
                const next = { ...prefs };
                delete next[id];
                return kind === 'contact' ? { contactPrefs: next } : { groupPrefs: next };
            }),
        }),
        { name: 'chat-actions-prefs' }
    )
);