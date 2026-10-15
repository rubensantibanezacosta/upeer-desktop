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
    connectedAt?: number;
    groupId?: string;
    groupMembers?: string[];
    relayUpeerId?: string;
}

interface CallStore {
    calls: Record<string, ActiveCallView>;
    activeCallId?: string;
    isStartingCall: boolean;
    connectedAtByCallId: Record<string, number>;
    beginCall: () => boolean;
    finishCallStart: () => void;
    setCalls: (calls: ActiveCallView[]) => void;
    setFromIncoming: (data: { callId: string; peerUpeerId: string; kind: CallKind; isGroup?: boolean; groupMembers?: string[]; groupId?: string }) => void;
    setStarted: (callId: string, peerUpeerId: string, kind: CallKind, isGroup?: boolean, groupMembers?: string[], groupId?: string) => void;
    markConnected: (callId: string, connectedAt?: number) => void;
    markEnded: (callId: string, reason?: string) => void;
    applyMediaUpdate: (callId: string, data: { muted: boolean; cameraEnabled: boolean }) => void;
    addGroupMember: (callId: string, memberId: string) => void;
    removeGroupMember: (callId: string, memberId: string) => void;
    setRelayUpeer: (callId: string, relayUpeerId?: string) => void;
    setActive: (callId?: string) => void;
    removeCall: (callId: string) => void;
    reset: () => void;
}

export const useCallStore = create<CallStore>((set) => ({
    calls: {},
    activeCallId: undefined,
    isStartingCall: false,
    connectedAtByCallId: {},

    beginCall: () => {
        let started = false;
        set((state) => {
            if (state.isStartingCall || Object.keys(state.calls).length > 0) return state;
            started = true;
            return { isStartingCall: true };
        });
        return started;
    },

    finishCallStart: () => set({ isStartingCall: false }),

    setCalls: (calls) => {
        const byId: Record<string, ActiveCallView> = {};
        for (const c of calls) {
            if (c.callId) {
                byId[c.callId] = c;
            }
        }
        set((state) => {
            const active = state.activeCallId && byId[state.activeCallId] ? state.activeCallId : Object.keys(byId)[0];
            const connectedAtByCallId = Object.fromEntries(Object.entries(byId).flatMap(([callId, call]) => call.connectedAt === undefined ? [] : [[callId, call.connectedAt]]));
            return { calls: byId, activeCallId: active, connectedAtByCallId };
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
                groupId: data.groupId,
                groupMembers: data.groupMembers,
            },
        },
        activeCallId: state.activeCallId ?? data.callId,
    })),

    setStarted: (callId, peerUpeerId, kind, isGroup, groupMembers, groupId) => set((state) => {
        const call = state.calls[callId];
        return {
            calls: {
                ...state.calls,
                [callId]: {
                    callId,
                    peerUpeerId,
                    phase: call?.phase ?? 'outgoing-ringing',
                    kind,
                    muted: call?.muted ?? false,
                    cameraEnabled: call?.cameraEnabled ?? kind === 'video',
                    isGroup,
                    groupId: groupId ?? call?.groupId,
                    groupMembers: groupMembers ?? call?.groupMembers,
                },
            },
            activeCallId: state.activeCallId ?? callId,
        };
    }),

    markConnected: (callId, connectedAt) => set((state) => {
        const call = state.calls[callId];
        if (!call) {
            return state;
        }
        const timestamp = state.connectedAtByCallId[callId] ?? call.connectedAt ?? connectedAt ?? Date.now();
        return {
            calls: { ...state.calls, [callId]: { ...call, phase: 'connected', connectedAt: timestamp } },
            connectedAtByCallId: { ...state.connectedAtByCallId, [callId]: timestamp },
        };
    }),

    markEnded: (callId, _reason) => set((state) => {
        if (!state.calls[callId]) return state;
        const { [callId]: _removed, ...rest } = state.calls;
        const nextActive = state.activeCallId === callId ? Object.keys(rest)[0] : state.activeCallId;
        const { [callId]: _connectedAt, ...connectedAtByCallId } = state.connectedAtByCallId;
        return { calls: rest, activeCallId: nextActive, connectedAtByCallId };
    }),
    applyMediaUpdate: (callId, data) => set((state) => {
        const call = state.calls[callId];
        if (!call) {
            return state;
        }
        return { calls: { ...state.calls, [callId]: { ...call, muted: data.muted, cameraEnabled: data.cameraEnabled } } };
    }),

    addGroupMember: (callId, memberId) => set((state) => {
        const call = state.calls[callId];
        if (!call || call.groupMembers?.includes(memberId)) {
            return state;
        }
        return { calls: { ...state.calls, [callId]: { ...call, groupMembers: [...(call.groupMembers ?? []), memberId] } } };
    }),

    removeGroupMember: (callId, memberId) => set((state) => {
        const call = state.calls[callId];
        if (!call) {
            return state;
        }
        return { calls: { ...state.calls, [callId]: { ...call, groupMembers: (call.groupMembers ?? []).filter((m) => m !== memberId) } } };
    }),

    setRelayUpeer: (callId, relayUpeerId) => set((state) => {
        const call = state.calls[callId];
        if (!call) {
            return state;
        }
        return { calls: { ...state.calls, [callId]: { ...call, relayUpeerId } } };
    }),

    setActive: (callId) => set({ activeCallId: callId }),

    removeCall: (callId) => set((state) => {
        const { [callId]: _removed, ...rest } = state.calls;
        const nextActive = state.activeCallId === callId ? Object.keys(rest)[0] : state.activeCallId;
        const { [callId]: _connectedAt, ...connectedAtByCallId } = state.connectedAtByCallId;
        return { calls: rest, activeCallId: nextActive, connectedAtByCallId };
    }),

    reset: () => set({ calls: {}, activeCallId: undefined, isStartingCall: false, connectedAtByCallId: {} }),
}));
