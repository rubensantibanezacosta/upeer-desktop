import { useCallback, useEffect } from 'react';
import { useCallStore } from './useCallStore.js';

export type { CallKind, CallPhase, ActiveCallView } from './useCallStore.js';

let eventsBound = false;

export function useCall() {
    const call = useCallStore((s) => s.call);
    const reset = useCallStore((s) => s.reset);

    useEffect(() => {
        if (eventsBound) {
            return undefined;
        }
        eventsBound = true;
        const unsubs = [
            window.upeer?.onCallIncoming?.((data) => useCallStore.getState().setFromIncoming(data)),
            window.upeer?.onCallAccepted?.(() => useCallStore.getState().markAccepted()),
            window.upeer?.onCallEnded?.((data) => useCallStore.getState().markEnded(data.reason)),
            window.upeer?.onCallMediaUpdate?.((data) => useCallStore.getState().applyMediaUpdate(data)),
        ].filter((fn) => typeof fn === 'function') as Array<() => void>;
        return () => {
            eventsBound = false;
            unsubs.forEach((fn) => fn());
        };
    }, []);

    const startCall = useCallback(async (peerUpeerId: string, kind: 'audio' | 'video') => {
        const result = await window.upeer.startCall(peerUpeerId, kind);
        if (result?.success && result.callId) {
            useCallStore.getState().setStarted(result.callId, peerUpeerId, kind);
        }
        return result;
    }, []);

    const acceptCall = useCallback(async () => {
        const callId = useCallStore.getState().call.callId;
        if (!callId) {
            return;
        }
        const result = await window.upeer.acceptCall(callId);
        if (result?.success) {
            useCallStore.getState().markAccepted();
        }
        return result;
    }, []);

    const rejectCall = useCallback(async () => {
        const callId = useCallStore.getState().call.callId;
        if (callId) {
            await window.upeer.rejectCall(callId);
        }
        useCallStore.getState().reset();
    }, []);

    const endCall = useCallback(async () => {
        const callId = useCallStore.getState().call.callId;
        if (callId) {
            await window.upeer.endCall(callId);
        }
        useCallStore.getState().reset();
    }, []);

    const toggleMute = useCallback(async () => {
        const callId = useCallStore.getState().call.callId;
        if (callId) {
            await window.upeer.toggleMedia(callId, 'mute');
        }
    }, []);

    const toggleCamera = useCallback(async () => {
        const callId = useCallStore.getState().call.callId;
        if (callId) {
            await window.upeer.toggleMedia(callId, 'camera');
        }
    }, []);

    const isActive = call.phase !== 'idle' && call.phase !== 'ended';

    return {
        call,
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
