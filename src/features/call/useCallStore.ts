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
    isGroup?: boolean;
    groupMembers?: string[];
}

interface CallStore {
    calls: Record<string, ActiveCallView>;
    activeCallId?: string;
    setCalls: (calls: ActiveCallView[]) => void;
    setFromIncoming: (data: { callId: string; peerUpeerId: string; kind: CallKind; isGroup?: boolean; groupMembers?: string[] }) => void;
    setStarted: (callId: string, peerUpeerId: string, kind: CallKind, isGroup?: boolean, groupMembers?: string[]) => void;
    markAccepted: (callId: string) => void;
    markConnected: (callId: string) => void;
    markEnded: (callId: string, reason?: string) => void;
    applyMediaUpdate: (callId: string, data: { muted: boolean; cameraEnabled: boolean }) => void;
    setActive: (callId?: string) => void;
    removeCall: (callId: string) => void;
    reset: () => void;
}

export const useCallStore = create<CallStore>((set) => ({
    calls: {},
    activeCallId: undefined,

    setCalls: (calls) => {
        const byId: Record<string, ActiveCallView> = {};
        for (const c of calls) {
            if (c.callId) {
                byId[c.callId] = c;
            }
        }
        set((state) => {
            const active = state.activeCallId && byId[state.activeCallId] ? state.activeCallId : Object.keys(byId)[0];
            return { calls: byId, activeCallId: active };
        });
    },

    setFromIncoming: (data) => set((state) => ({
        calls: {
            ...state.calls,
            [data.callId]: {
                callId: data.callId,
                peerUpeerId: data.peerUpeerId,
                phase: 'incoming-ringing',
                kind: data.kind,
                muted: false,
                cameraEnabled: data.kind === 'video',
                isGroup: data.isGroup,
                groupMembers: data.groupMembers,
            },
        },
        activeCallId: state.activeCallId ?? data.callId,
    })),

    setStarted: (callId, peerUpeerId, kind, isGroup, groupMembers) => set((state) => ({
        calls: {
            ...state.calls,
            [callId]: {
                callId,
                peerUpeerId,
                phase: 'outgoing-ringing',
                kind,
                muted: false,
                cameraEnabled: kind === 'video',
                isGroup,
                groupMembers,
            },
        },
        activeCallId: state.activeCallId ?? callId,
    })),

    markAccepted: (callId) => set((state) => {
        const call = state.calls[callId];
        if (!call) {
            return state;
        }
        return { calls: { ...state.calls, [callId]: { ...call, phase: 'negotiating' } } };
    }),

    markConnected: (callId) => set((state) => {
        const call = state.calls[callId];
        if (!call) {
            return state;
        }
        return { calls: { ...state.calls, [callId]: { ...call, phase: 'connected' } } };
    }),

    markEnded: (callId, _reason) => set((state) => {
        const call = state.calls[callId];
        if (!call) {
            return state;
        }
        const { [callId]: _removed, ...rest } = state.calls;
        const nextActive = state.activeCallId === callId ? Object.keys(rest)[0] : state.activeCallId;
        return { calls: rest, activeCallId: nextActive };
    }),
    applyMediaUpdate: (callId, data) => set((state) => {
        const call = state.calls[callId];
        if (!call) {
            return state;
        }
        return { calls: { ...state.calls, [callId]: { ...call, muted: data.muted, cameraEnabled: data.cameraEnabled } } };
    }),

    setActive: (callId) => set({ activeCallId: callId }),

    removeCall: (callId) => set((state) => {
        const { [callId]: _removed, ...rest } = state.calls;
        const nextActive = state.activeCallId === callId ? Object.keys(rest)[0] : state.activeCallId;
        return { calls: rest, activeCallId: nextActive };
    }),

    reset: () => set({ calls: {}, activeCallId: undefined }),
}));
