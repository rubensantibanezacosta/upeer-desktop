import { create } from 'zustand';

interface ChatRetentionState {
    map: Record<string, string>;
    loaded: boolean;
    hydrate: () => Promise<void>;
    setRetention: (chatId: string, retention: string) => Promise<string[]>;
}

function hasBridge(): boolean {
    return typeof window !== 'undefined' && typeof window.upeer?.getChatRetention === 'function';
}

export const useChatRetentionStore = create<ChatRetentionState>()((set) => ({
    map: {},
    loaded: false,
    hydrate: async () => {
        if (!hasBridge()) {
            set({ loaded: true });
            return;
        }

        try {
            const result = await window.upeer.getChatRetention();
            set({ map: result?.map ?? {}, loaded: true });
        } catch (cause) {
            console.warn('No se pudieron leer los mensajes temporales.', cause);
            set({ loaded: true });
        }
    },
    setRetention: async (chatId, retention) => {
        if (!hasBridge()) return [];

        try {
            const result = await window.upeer.setChatRetention(chatId, retention);
            set({ map: result?.map ?? {} });
            return result?.expiredChats ?? [];
        } catch (cause) {
            console.warn('No se pudieron guardar los mensajes temporales.', cause);
            return [];
        }
    },
}));

export function retentionFor(map: Record<string, string>, chatId?: string | null): string {
    if (!chatId) return 'off';
    return map[chatId] ?? 'off';
}
