import React, { useEffect, useState } from 'react';
import { CallIncomingModal } from './CallIncomingModal.js';
import { CallOverlay } from './CallOverlay.js';
import { useCall } from './useCall.js';

interface CallHostProps {
    resolvePeerName: (upeerId: string) => string;
    resolvePeerAvatar?: (upeerId: string) => string | undefined;
}

export const CallHost: React.FC<CallHostProps> = ({ resolvePeerName, resolvePeerAvatar }) => {
    const { call, acceptCall, rejectCall, endCall, toggleMute, toggleCamera, isActive } = useCall();
    const [dismissedEnded, setDismissedEnded] = useState(false);

    useEffect(() => {
        if (call.phase === 'ended') {
            const timer = setTimeout(() => {
                setDismissedEnded(true);
            }, 2000);
            return () => clearTimeout(timer);
        }
        setDismissedEnded(false);
        return undefined;
    }, [call.phase]);

    const peerName = call.peerUpeerId ? resolvePeerName(call.peerUpeerId) : '';
    const avatar = call.peerUpeerId ? resolvePeerAvatar?.(call.peerUpeerId) : undefined;

    if (call.phase === 'incoming-ringing' && call.callId) {
        return (
            <CallIncomingModal
                open
                kind={call.kind}
                callerName={peerName || 'Contacto'}
                onAccept={() => void acceptCall()}
                onReject={() => void rejectCall()}
            />
        );
    }

    if (isActive && call.callId && !dismissedEnded) {
        return (
            <CallOverlay
                call={call}
                peerName={peerName || 'Contacto'}
                avatar={avatar}
                onToggleMute={() => void toggleMute()}
                onToggleCamera={() => void toggleCamera()}
                onEnd={() => void endCall()}
            />
        );
    }

    return null;
};
