import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PrivacyState {
    readReceipts: boolean;
    shareActivity: boolean;
    setReadReceipts: (v: boolean) => void;
    setShareActivity: (v: boolean) => void;
}

export const usePrivacyStore = create<PrivacyState>()(
    persist(
        (set) => ({
            readReceipts: true,
            shareActivity: true,
            setReadReceipts: (v) => set({ readReceipts: v }),
            setShareActivity: (v) => set({ shareActivity: v }),
        }),
        { name: 'privacy-settings' }
    )
);