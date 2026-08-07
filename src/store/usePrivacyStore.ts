import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PrivacyState {
    readReceipts: boolean;
    onlineStatus: boolean;
    lastSeen: boolean;
    setReadReceipts: (v: boolean) => void;
    setOnlineStatus: (v: boolean) => void;
    setLastSeen: (v: boolean) => void;
}

export const usePrivacyStore = create<PrivacyState>()(
    persist(
        (set) => ({
            readReceipts: true,
            onlineStatus: true,
            lastSeen: true,
            setReadReceipts: (v) => set({ readReceipts: v }),
            setOnlineStatus: (v) => set({ onlineStatus: v }),
            setLastSeen: (v) => set({ lastSeen: v }),
        }),
        { name: 'privacy-settings' }
    )
);