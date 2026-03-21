import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotificationState {
    msgNotif: boolean;
    reqNotif: boolean;
    sound: boolean;
    setMsgNotif: (v: boolean) => void;
    setReqNotif: (v: boolean) => void;
    setSound: (v: boolean) => void;
}

export const useNotificationStore = create<NotificationState>()(
    persist(
        (set) => ({
            msgNotif: true,
            reqNotif: true,
            sound: true,
            setMsgNotif: (v) => set({ msgNotif: v }),
            setReqNotif: (v) => set({ reqNotif: v }),
            setSound: (v) => set({ sound: v }),
        }),
        { name: 'notification-settings' }
    )
);
