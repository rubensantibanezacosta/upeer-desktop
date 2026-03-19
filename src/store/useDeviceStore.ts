import { create } from 'zustand';

export interface Device {
    id: number;
    upeerId: string;
    deviceId: string;
    clientName: string | null;
    platform: string | null;
    clientVersion: string | null;
    lastSeen: number;
    isTrusted: boolean;
}

interface DeviceState {
    devices: Device[];
    isLoading: boolean;
    error: string | null;
}

interface DeviceActions {
    fetchDevices: () => Promise<void>;
    setTrust: (deviceId: string, isTrusted: boolean) => Promise<void>;
    removeDevice: (deviceId: string) => Promise<void>;
}

export const useDeviceStore = create<DeviceState & DeviceActions>((set, get) => ({
    devices: [],
    isLoading: false,
    error: null,

    fetchDevices: async () => {
        set({ isLoading: true, error: null });
        try {
            const result = await (window as any).upeer.getDevices();
            set({ devices: result, isLoading: false });
        } catch (err: any) {
            set({ error: err.message, isLoading: false });
        }
    },

    setTrust: async (deviceId, isTrusted) => {
        try {
            await (window as any).upeer.setDeviceTrust(deviceId, isTrusted);
            // Optimistic update
            set({
                devices: get().devices.map(d =>
                    d.deviceId === deviceId ? { ...d, isTrusted } : d
                )
            });
        } catch (err: any) {
            set({ error: err.message });
        }
    },

    removeDevice: async (deviceId) => {
        try {
            await (window as any).upeer.deleteDevice(deviceId);
            // Optimistic update
            set({
                devices: get().devices.filter(d => d.deviceId !== deviceId)
            });
        } catch (err: any) {
            set({ error: err.message });
        }
    }
}));
