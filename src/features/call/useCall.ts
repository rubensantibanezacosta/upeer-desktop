import { useCallback, useEffect } from 'react';
import { useCallStore } from './useCallStore.js';

export type { CallKind, CallPhase, ActiveCallView } from './useCallStore.js';

export function useCall() {
    const calls = useCallStore((s) => s.calls);
    const activeCallId = useCallStore((s) => s.activeCallId);
    const reset = useCallStore((s) => s.reset);
    const idleCall: import('./useCallStore.js').ActiveCallView = { phase: 'idle', kind: 'audio', muted: false, cameraEnabled: false };
    const call = activeCallId ? (calls[activeCallId] ?? idleCall) : idleCall;

    useEffect(() => {
        const unsubs = [
            window.upeer?.onCallIncoming?.((data) => useCallStore.getState().setFromIncoming(data)),
            window.upeer?.onCallAccepted?.((data) => {
                useCallStore.getState().markAccepted(data.callId);
                useCallStore.getState().setActive(data.callId);
            }),
            window.upeer?.onCallEnded?.((data) => useCallStore.getState().markEnded(data.callId, data.reason)),
            window.upeer?.onCallMemberJoined?.((data) => useCallStore.getState().addGroupMember(data.callId, data.peerUpeerId)),
            window.upeer?.onCallMemberLeft?.((data) => useCallStore.getState().removeGroupMember(data.callId, data.peerUpeerId)),
            window.upeer?.onCallMeta?.((data) => {
                const meta = data.meta as { type?: string; relay?: string } | undefined;
                if (meta && meta.type === 'relay') {
                    useCallStore.getState().setRelayUpeer(data.callId, typeof meta.relay === 'string' ? meta.relay : undefined);
                }
            }),
            window.upeer?.onCallRing?.((data) => useCallStore.getState().setActive(data.callId)),
        ].filter((fn) => typeof fn === 'function') as Array<() => void>;

        let disposed = false;
        window.upeer?.getAllCalls?.().then((result) => {
            if (!disposed && result?.success && Array.isArray(result.calls)) {
                useCallStore.getState().setCalls(result.calls as unknown as import('./useCallStore.js').ActiveCallView[]);
            }
        }).catch(() => undefined);

        return () => {
            disposed = true;
            unsubs.forEach((fn) => fn());
        };
    }, []);

    const startCall = useCallback(async (peerUpeerId: string, kind: 'audio' | 'video', isGroup?: boolean, groupMembers?: string[]) => {
        const result = isGroup
            ? await window.upeer.startGroupCall(groupMembers ?? [], kind)
            : await window.upeer.startCall(peerUpeerId, kind);
        if (result?.success && result.callId) {
            useCallStore.getState().setStarted(result.callId, peerUpeerId, kind, isGroup, groupMembers);
            useCallStore.getState().setActive(result.callId);
        }
        return result;
    }, []);

    const acceptCall = useCallback(async (callId?: string) => {
        const target = callId ?? useCallStore.getState().activeCallId;
        if (!target) {
            return;
        }
        const result = await window.upeer.acceptCall(target);
        if (result?.success) {
            useCallStore.getState().markAccepted(target);
            useCallStore.getState().setActive(target);
        }
        return result;
    }, []);

    const rejectCall = useCallback(async (callId?: string) => {
        const target = callId ?? useCallStore.getState().activeCallId;
        if (target) {
            await window.upeer.rejectCall(target);
            useCallStore.getState().removeCall(target);
        }
    }, []);

    const endCall = useCallback(async (callId?: string) => {
        const target = callId ?? useCallStore.getState().activeCallId;
        if (target) {
            await window.upeer.endCall(target);
            useCallStore.getState().removeCall(target);
        }
    }, []);

    const toggleMute = useCallback(async (callId?: string) => {
        const target = callId ?? useCallStore.getState().activeCallId;
        if (!target) {
            return;
        }
        const current = useCallStore.getState().calls[target];
        if (!current) {
            return;
        }
        await window.upeer.toggleMedia(target, 'mute');
        useCallStore.getState().applyMediaUpdate(target, { muted: !current.muted, cameraEnabled: current.cameraEnabled });
    }, []);

    const toggleCamera = useCallback(async (callId?: string) => {
        const target = callId ?? useCallStore.getState().activeCallId;
        if (!target) {
            return;
        }
        const current = useCallStore.getState().calls[target];
        if (!current) {
            return;
        }
        await window.upeer.toggleMedia(target, 'camera');
        useCallStore.getState().applyMediaUpdate(target, { muted: current.muted, cameraEnabled: !current.cameraEnabled });
    }, []);

    const setActive = useCallStore((s) => s.setActive);
    const activeCalls = Object.values(calls);
    const isActive = activeCalls.length > 0;

    return {
        call,
        activeCalls,
        activeCallId,
        setActive,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleCamera,
        reset,
        isActive,
    };
}
