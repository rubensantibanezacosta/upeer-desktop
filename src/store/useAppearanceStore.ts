import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_CHAT_STYLE, resolveChatStyleId } from '../features/chat/style/chatStyle.js';
import type { ChatStyleId } from '../features/chat/style/chatStyle.js';

export type AppearanceTheme = 'dark' | 'light' | 'system';
export type AppearanceFontSize = 'small' | 'medium' | 'large';

interface AppearanceState {
    theme: AppearanceTheme;
    fontSize: AppearanceFontSize;
    chatStyles: Record<string, ChatStyleId>;
    setTheme: (v: AppearanceTheme) => void;
    setFontSize: (v: AppearanceFontSize) => void;
    setChatStyle: (chatId: string, style: ChatStyleId) => void;
}

function sanitizeChatStyles(value: unknown): Record<string, ChatStyleId> {
    if (!value || typeof value !== 'object') return {};

    const result: Record<string, ChatStyleId> = {};
    for (const [chatId, style] of Object.entries(value as Record<string, unknown>)) {
        if (typeof style !== 'string' || resolveChatStyleId(style) !== style) continue;
        if (style === DEFAULT_CHAT_STYLE) continue;
        result[chatId] = style;
    }

    return result;
}

export const useAppearanceStore = create<AppearanceState>()(
    persist(
        (set) => ({
            theme: 'dark',
            fontSize: 'medium',
            chatStyles: {},
            setTheme: (v) => set({ theme: v }),
            setFontSize: (v) => set({ fontSize: v }),
            setChatStyle: (chatId, style) => set((state) => {
                const next = { ...state.chatStyles };
                if (style === DEFAULT_CHAT_STYLE) {
                    delete next[chatId];
                } else {
                    next[chatId] = style;
                }
                return { chatStyles: next };
            }),
        }),
        {
            name: 'appearance-settings',
            merge: (persisted, current) => {
                const state = (persisted ?? {}) as Partial<AppearanceState>;
                return {
                    ...current,
                    theme: state.theme ?? current.theme,
                    fontSize: state.fontSize ?? current.fontSize,
                    chatStyles: sanitizeChatStyles(state.chatStyles),
                };
            },
            migrate: (persisted) => {
                const state = (persisted ?? {}) as Partial<AppearanceState>;
                return {
                    theme: state.theme ?? 'dark',
                    fontSize: state.fontSize ?? 'medium',
                    chatStyles: sanitizeChatStyles(state.chatStyles),
                };
            },
        }
    )
);

export const FONT_SIZE_PX: Record<AppearanceFontSize, number> = {
    small: 13,
    medium: 15,
    large: 17,
};