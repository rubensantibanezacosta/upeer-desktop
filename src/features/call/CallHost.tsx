import React, { useEffect } from 'react';
import { Box } from '@mui/joy';
import callSoundUrl from '../../../resources/sound/call-sound.mp3?url';
import { CallIncomingModal } from './CallIncomingModal.js';
import { CallWindow } from './CallWindow.js';
import { useCall } from './useCall.js';
import type { Contact, Group } from '../../types/chat.js';
import type { AppView } from '../../store/useNavigationStore.js';

interface CallHostProps {
    appView: AppView;
    contacts: Contact[];
    groups: Group[];
}

export const CallHost: React.FC<CallHostProps> = ({ appView, contacts, groups }) => {
    const { activeCalls, acceptCall, rejectCall, toggleMute, toggleCamera, endCall } = useCall();
    const incoming = activeCalls.find((c) => c.phase === 'incoming-ringing' && c.callId);
    const incomingCallId = incoming?.callId;
    const call = activeCalls.find((item) => item.callId);
    const group = call?.isGroup ? groups.find((item) => item.groupId === (call.groupId ?? call.peerUpeerId)) : undefined;
    const contact = contacts.find((item) => item.upeerId === call?.peerUpeerId);
    const peerName = group?.name || contact?.name || 'Contacto';

    useEffect(() => {
        if (!incomingCallId) return;
        const audio = new Audio(callSoundUrl);
        audio.loop = true;
        void audio.play().catch((cause: unknown) => {
            console.warn('No se pudo reproducir el sonido de llamada entrante', cause);
        });
        return () => {
            audio.pause();
            audio.currentTime = 0;
        };
    }, [incomingCallId]);

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
            {call?.callId && (
                <Box sx={{ position: 'fixed', inset: '0 0 0 64px', zIndex: 9, display: appView === 'calls' ? 'flex' : 'none', bgcolor: '#111', overflow: 'hidden' }}>
                    <CallWindow
                        call={call}
                        peerName={peerName}
                        avatar={group?.avatar || contact?.avatar}
                        embedded
                        onToggleMute={() => void toggleMute(call.callId)}
                        onToggleCamera={() => void toggleCamera(call.callId)}
                        onEnd={() => void endCall(call.callId)}
                    />
                </Box>
            )}
        </>
    );
};
