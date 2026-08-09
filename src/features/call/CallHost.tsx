import React, { useState } from 'react';
import { Box, Chip } from '@mui/joy';
import { CallIncomingModal } from './CallIncomingModal.js';
import { CallWindow } from './CallWindow.js';
import { useCall } from './useCall.js';

interface CallHostProps {
    resolvePeerName: (upeerId: string) => string;
    resolvePeerAvatar?: (upeerId: string) => string | undefined;
}

interface MinimizedView {
    callId: string;
    peerUpeerId?: string;
    kind: 'audio' | 'video';
}

export const CallHost: React.FC<CallHostProps> = ({ resolvePeerName, resolvePeerAvatar }) => {
    const { activeCalls, acceptCall, rejectCall, endCall, toggleMute, toggleCamera } = useCall();
    const [minimized, setMinimized] = useState<Record<string, boolean>>({});

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

    // Una ventana flotante por cada llamada activa (estilo WhatsApp), salvo las minimizadas.
    const expanded = activeCalls.filter((c) => c.callId && !minimized[c.callId]);
    const collapsed: MinimizedView[] = activeCalls
        .filter((c) => c.callId && minimized[c.callId])
        .map((c) => ({ callId: c.callId as string, peerUpeerId: c.peerUpeerId, kind: c.kind }));

    return (
        <>
            {expanded.map((call) => {
                const callId = call.callId as string;
                const name = call.peerUpeerId ? resolvePeerName(call.peerUpeerId) : 'Contacto';
                const avatar = call.peerUpeerId ? resolvePeerAvatar?.(call.peerUpeerId) : undefined;
                return (
                    <CallWindow
                        key={callId}
                        call={call}
                        peerName={name || 'Contacto'}
                        avatar={avatar}
                        onToggleMute={() => void toggleMute(callId)}
                        onToggleCamera={() => void toggleCamera(callId)}
                        onEnd={() => void endCall(callId)}
                        onMinimize={() => setMinimized((prev) => ({ ...prev, [callId]: true }))}
                    />
                );
            })}

            {collapsed.length > 0 && (
                <Box sx={{ position: 'fixed', bottom: 16, left: 16, zIndex: 1400, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {collapsed.map((c) => (
                        <Chip
                            key={c.callId}
                            size="sm"
                            variant="solid"
                            color="primary"
                            sx={{ cursor: 'pointer', px: 1.5, py: 0.75, borderRadius: 4 }}
                            onClick={() => setMinimized((prev) => ({ ...prev, [c.callId]: false }))}
                        >
                            {c.kind === 'video' ? '📹' : '📞'} {c.peerUpeerId ? resolvePeerName(c.peerUpeerId) : 'Llamada'} · reanudar
                        </Chip>
                    ))}
                </Box>
            )}
        </>
    );
};
