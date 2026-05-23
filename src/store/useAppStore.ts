import { create } from 'zustand';
import { YggNetworkStatus } from '../components/ui/YggstackSplash.js';

interface AppState {
    isAuthenticated: boolean | null;
    networkStatus: YggNetworkStatus;
    isFirstConnect: boolean;
    yggAddress: string | undefined;
}

interface AppActions {
    setAuthenticated: (auth: boolean | null) => void;
    setNetworkStatus: (status: YggNetworkStatus) => void;
    setFirstConnect: (first: boolean) => void;
    setYggAddress: (address: string | undefined) => void;
    checkAuth: () => Promise<boolean>;
}

export type AppStore = AppState & AppActions;

export const useAppStore = create<AppStore>((set) => ({
    isAuthenticated: null,
    networkStatus: 'connecting',
    isFirstConnect: true,
    yggAddress: undefined,

    setAuthenticated: (auth) => set({ isAuthenticated: auth }),
    setNetworkStatus: (status) => set({ networkStatus: status }),
    setFirstConnect: (first) => set({ isFirstConnect: first }),
    setYggAddress: (address) => set({ yggAddress: address }),

    checkAuth: async () => {
        try {
            const status = await window.upeer.identityStatus();
            const isAuthenticated = !status.isLocked;
            set({ isAuthenticated });
            return isAuthenticated;
        } catch (error) {
            set({ isAuthenticated: false });
            return false;
        }
    }
}));
