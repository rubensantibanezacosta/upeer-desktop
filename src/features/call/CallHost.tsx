import React from 'react';
import { CallIncomingModal } from './CallIncomingModal.js';
import { useCall } from './useCall.js';
import type { Contact } from '../../types/chat.js';

interface CallHostProps {
    contacts: Contact[];
}

export const CallHost: React.FC<CallHostProps> = ({ contacts }) => {
    const { activeCalls, acceptCall, rejectCall } = useCall();
    const incoming = activeCalls.find((c) => c.phase === 'incoming-ringing' && c.callId);

    return (
        <>
            {incoming?.callId && (
                <CallIncomingModal
                    open
                    kind={incoming.kind}
                    isGroup={incoming.isGroup}
                    callerName={incoming.peerUpeerId ? contacts.find((item) => item.upeerId === incoming.peerUpeerId)?.name || 'Contacto' : 'Contacto'}
                    callerAvatar={incoming.peerUpeerId ? contacts.find((item) => item.upeerId === incoming.peerUpeerId)?.avatar : undefined}
                    onAccept={() => void acceptCall(incoming.callId)}
                    onReject={() => void rejectCall(incoming.callId)}
                />
            )}
        </>
    );
};
