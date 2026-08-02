import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppearanceTheme = 'dark' | 'light' | 'system';
export type AppearanceFontSize = 'small' | 'medium' | 'large';

interface AppearanceState {
    theme: AppearanceTheme;
    fontSize: AppearanceFontSize;
    setTheme: (v: AppearanceTheme) => void;
    setFontSize: (v: AppearanceFontSize) => void;
}

export const useAppearanceStore = create<AppearanceState>()(
    persist(
        (set) => ({
            theme: 'dark',
            fontSize: 'medium',
            setTheme: (v) => set({ theme: v }),
            setFontSize: (v) => set({ fontSize: v }),
        }),
        { name: 'appearance-settings' }
    )
);

export const FONT_SIZE_PX: Record<AppearanceFontSize, number> = {
    small: 13,
    medium: 15,
    large: 17,
};