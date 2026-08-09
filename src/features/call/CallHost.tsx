import React, { useEffect, useState } from 'react';
import { Avatar, Box, Chip, Tooltip } from '@mui/joy';
import CallEndIcon from '@mui/icons-material/CallEnd';
import { CallIncomingModal } from './CallIncomingModal.js';
import { CallOverlay } from './CallOverlay.js';
import { useCall } from './useCall.js';

interface CallHostProps {
    resolvePeerName: (upeerId: string) => string;
    resolvePeerAvatar?: (upeerId: string) => string | undefined;
}

export const CallHost: React.FC<CallHostProps> = ({ resolvePeerName, resolvePeerAvatar }) => {
    const { activeCalls, activeCallId, setActive, acceptCall, rejectCall, endCall, toggleMute, toggleCamera, isActive } = useCall();
    const [minimized, setMinimized] = useState(false);

    useEffect(() => {
        if (!isActive) {
            setMinimized(false);
        }
    }, [isActive]);

    // Modal de llamada entrante (la primera que esté en incoming-ringing).
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

    const hasActive = isActive && activeCallId && activeCalls.length > 0;
    const minimizedCalls = activeCalls.filter((c) => c.callId !== activeCallId);

    // Llamada activa a pantalla completa (salvo que esté minimizada).
    if (hasActive && !minimized && activeCallId) {
        const callId = activeCallId;
        const current = activeCalls.find((c) => c.callId === callId);
        if (!current) {
            return null;
        }
        const name = current.peerUpeerId ? resolvePeerName(current.peerUpeerId) : 'Contacto';
        const avatar = current.peerUpeerId ? resolvePeerAvatar?.(current.peerUpeerId) : undefined;
        return (
            <>
                <CallOverlay
                    call={current}
                    peerName={name || 'Contacto'}
                    avatar={avatar}
                    onToggleMute={() => void toggleMute(callId)}
                    onToggleCamera={() => void toggleCamera(callId)}
                    onEnd={() => void endCall(callId)}
                    onMinimize={() => setMinimized(true)}
                />
                {minimizedCalls.length > 0 && (
                    <CallFloatingBar calls={minimizedCalls} resolveName={resolvePeerName} onExpand={(id) => setActive(id)} onEnd={(id) => void endCall(id)} />
                )}
            </>
        );
    }

    // Minimizado o múltiples llamadas: barra flotante con todas.
    if (activeCalls.length > 0) {
        return (
            <CallFloatingBar
                calls={activeCalls}
                resolveName={resolvePeerName}
                onExpand={(id) => {
                    setActive(id);
                    setMinimized(false);
                }}
                onEnd={(id) => void endCall(id)}
            />
        );
    }

    return null;
};

interface FloatingCall {
    callId?: string;
    peerUpeerId?: string;
    kind: 'audio' | 'video';
}

function CallFloatingBar({
    calls,
    resolveName,
    onExpand,
    onEnd,
}: {
    calls: FloatingCall[];
    resolveName: (upeerId: string) => string;
    onExpand: (id: string) => void;
    onEnd: (id: string) => void;
}) {
    return (
        <Box sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1400, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {calls.filter((c) => c.callId).map((c) => (
                <Box
                    key={c.callId}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        p: 1,
                        pr: 0.5,
                        borderRadius: 4,
                        backgroundColor: 'rgba(32,32,32,0.95)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                        cursor: 'pointer',
                        border: '1px solid rgba(255,255,255,0.15)',
                    }}
                    onClick={() => c.callId && onExpand(c.callId)}
                >
                    <Avatar size="sm">{c.kind === 'video' ? '📹' : '📞'}</Avatar>
                    <Chip size="sm" variant="soft" color="primary">{c.peerUpeerId ? resolveName(c.peerUpeerId) : 'Llamada'}</Chip>
                    <Tooltip title="Colgar">
                        <Box
                            component="span"
                            sx={{ display: 'flex', alignItems: 'center', p: 0.5, borderRadius: '50%', color: '#f44336', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}
                            onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                if (c.callId) {
                                    onEnd(c.callId);
                                }
                            }}
                        >
                            <CallEndIcon sx={{ fontSize: 20 }} />
                        </Box>
                    </Tooltip>
                </Box>
            ))}
        </Box>
    );
}
