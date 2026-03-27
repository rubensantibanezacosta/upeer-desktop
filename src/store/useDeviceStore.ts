import { create } from 'zustand';

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Error desconocido';

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
            const result = await window.upeer.getDevices();
            set({ devices: result, isLoading: false });
        } catch (error: unknown) {
            set({ error: getErrorMessage(error), isLoading: false });
        }
    },

    setTrust: async (deviceId, isTrusted) => {
        try {
            await window.upeer.setDeviceTrust(deviceId, isTrusted);
            set({
                devices: get().devices.map(d =>
                    d.deviceId === deviceId ? { ...d, isTrusted } : d
                )
            });
        } catch (error: unknown) {
            set({ error: getErrorMessage(error) });
        }
    },

    removeDevice: async (deviceId) => {
        try {
            await window.upeer.deleteDevice(deviceId);
            set({
                devices: get().devices.filter(d => d.deviceId !== deviceId)
            });
        } catch (error: unknown) {
            set({ error: getErrorMessage(error) });
        }
    }
}));
