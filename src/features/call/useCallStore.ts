import { create } from 'zustand';

export type CallKind = 'audio' | 'video';
export type CallPhase = 'idle' | 'outgoing-ringing' | 'incoming-ringing' | 'negotiating' | 'connected' | 'ended';

export interface ActiveCallView {
    callId?: string;
    peerUpeerId?: string;
    phase: CallPhase;
    kind: CallKind;
    muted: boolean;
    cameraEnabled: boolean;
    endReason?: string;
}

interface CallStore {
    call: ActiveCallView;
    setFromIncoming: (data: { callId: string; peerUpeerId: string; kind: CallKind }) => void;
    setStarted: (callId: string, peerUpeerId: string, kind: CallKind) => void;
    markAccepted: () => void;
    markEnded: (reason?: string) => void;
    applyMediaUpdate: (data: { muted: boolean; cameraEnabled: boolean }) => void;
    reset: () => void;
}

const IDLE_CALL: ActiveCallView = { phase: 'idle', kind: 'audio', muted: false, cameraEnabled: false };

export const useCallStore = create<CallStore>((set) => ({
    call: IDLE_CALL,
    setFromIncoming: (data) => set((state) => ({
        call: {
            ...state.call,
            callId: data.callId,
            peerUpeerId: data.peerUpeerId,
            phase: 'incoming-ringing',
            kind: data.kind,
            muted: false,
            cameraEnabled: data.kind === 'video',
        },
    })),
    setStarted: (callId, peerUpeerId, kind) => set((state) => ({
        call: {
            ...state.call,
            callId,
            peerUpeerId,
            phase: 'outgoing-ringing',
            kind,
            muted: false,
            cameraEnabled: kind === 'video',
        },
    })),
    markAccepted: () => set((state) => ({ call: { ...state.call, phase: 'negotiating' } })),
    markEnded: (reason) => set((state) => ({ call: { ...state.call, phase: 'ended', endReason: reason } })),
    applyMediaUpdate: (data) => set((state) => ({ call: { ...state.call, muted: data.muted, cameraEnabled: data.cameraEnabled } })),
    reset: () => set({ call: IDLE_CALL }),
}));
