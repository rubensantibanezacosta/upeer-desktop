import React from 'react';
import { CallIncomingModal } from './CallIncomingModal.js';
import { useCall } from './useCall.js';

interface CallHostProps {
    resolvePeerName: (upeerId: string) => string;
}

export const CallHost: React.FC<CallHostProps> = ({ resolvePeerName }) => {
    const { activeCalls, acceptCall, rejectCall } = useCall();

    // Modal de llamada entrante (la primera en incoming-ringing).
    const incoming = activeCalls.find((c) => c.phase === 'incoming-ringing' && c.callId);
    if (incoming?.callId) {
        const name = incoming.peerUpeerId ? resolvePeerName(incoming.peerUpeerId) : 'Contacto';
        return (
            <CallIncomingModal
                open
                kind={incoming.kind}
                callerName={name || 'Contacto'}
                onAccept={() => void acceptCall(incoming.callId)}
                onReject={() => void rejectCall(incoming.callId)}
            />
        );
    }

    return null;
};
