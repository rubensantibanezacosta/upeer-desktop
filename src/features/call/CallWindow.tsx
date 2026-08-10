import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, Box, Chip, IconButton, Tooltip, Typography } from '@mui/joy';
import MinimizeIcon from '@mui/icons-material/Minimize';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import CallEndIcon from '@mui/icons-material/CallEnd';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import { CallControls } from './CallControls.js';
import { useCallMedia } from './useCallMedia.js';
import type { ActiveCallView } from './useCall.js';

interface CallWindowProps {
    call: ActiveCallView;
    peerName: string;
    avatar?: string;
    onToggleMute: () => void;
    onToggleCamera: () => void;
    onEnd: () => void;
    onMinimize: () => void;
}

const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 560;

const shareOptionSx = {
    textAlign: 'left' as const,
    border: 'none',
    background: 'transparent',
    color: 'white',
    cursor: 'pointer',
    fontSize: 12,
    px: 1.5,
    py: 0.5,
    borderRadius: 6,
    '&:hover': { backgroundColor: 'rgba(255,255,255,0.12)' },
};

function formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const CallWindow: React.FC<CallWindowProps> = ({ call, peerName, avatar, onToggleMute, onToggleCamera, onEnd, onMinimize }) => {
    const [pos, setPos] = useState<{ x: number; y: number }>({ x: 16, y: 16 });
    const [size] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
    const [expanded, setExpanded] = useState(false);
    const [startedAt] = useState<number>(Date.now());
    const [seconds, setSeconds] = useState(0);
    const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const [showShareOptions, setShowShareOptions] = useState(false);
    const media = useCallMedia();
    const { startLocalCapture, stopLocalCapture, localStream, remoteStream, startScreenShare, stopScreenShare, screenSharing, setVideoEnabled, setAudioEnabled } = media;

    useEffect(() => {
        const timer = setInterval(() => {
            setSeconds(Math.floor((Date.now() - startedAt) / 1000));
        }, 1000);
        return () => clearInterval(timer);
    }, [startedAt]);

    const isVideo = call.kind === 'video';
    const isGroup = call.isGroup === true;
    const isVideoActive = isVideo && (call.phase === 'negotiating' || call.phase === 'connected');
    const effWidth = expanded ? Math.max(size.width, 640) : size.width;
    const effHeight = expanded ? Math.max(size.height, 480) : size.height;


    useEffect(() => {
        if (call.phase !== 'negotiating' && call.phase !== 'connected') {
            return;
        }
        void startLocalCapture(isVideo);
        return () => {
            stopLocalCapture();
            stopScreenShare();
        };
    }, [call.phase, isVideo, startLocalCapture, stopLocalCapture, stopScreenShare]);

    useEffect(() => {
        if (videoRef.current && localStream) {
            videoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    useEffect(() => {
        if (call.phase !== 'connected') {
            return;
        }
        void setVideoEnabled(call.cameraEnabled);
    }, [call.phase, call.cameraEnabled, setVideoEnabled]);

    useEffect(() => {
        if (call.phase !== 'connected') {
            return;
        }
        void setAudioEnabled(!call.muted);
    }, [call.phase, call.muted, setAudioEnabled]);

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('button, [data-nodrag="true"]')) {
            return;
        }
        dragRef.current = { x: pos.x, y: pos.y, startX: e.clientX, startY: e.clientY };
        const onMove = (ev: PointerEvent) => {
            const drag = dragRef.current;
            if (!drag) {
                return;
            }
            setPos({ x: drag.x + (ev.clientX - drag.startX), y: drag.y + (ev.clientY - drag.startY) });
        };
        const onUp = () => {
            dragRef.current = null;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }, [pos]);

    const doShare = useCallback((target: 'screen' | 'window', withSystemAudio: boolean) => {
        setShowShareOptions(false);
        if (screenSharing) {
            stopScreenShare();
        } else {
            void startScreenShare({ target, withSystemAudio });
        }
    }, [screenSharing, startScreenShare, stopScreenShare]);

    return (

        <Box
            onPointerDown={handlePointerDown}
            sx={{
                position: 'fixed',
                top: pos.y,
                left: pos.x,
                width: effWidth,
                height: effHeight,
                zIndex: 1400,
                backgroundColor: '#1f1f1f',
                borderRadius: 12,
                boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'white',
                userSelect: 'none',
                cursor: 'grab',
            }}
        >
            <Box
                data-nodrag="true"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1.5,
                    py: 0.75,
                    backgroundColor: 'rgba(0,0,0,0.25)',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    cursor: 'grab',
                }}
                onPointerDown={handlePointerDown}
            >
                <Typography level="body-sm" sx={{ flex: 1, fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {peerName}
                </Typography>
                {isGroup && (
                    <Chip size="sm" variant="soft" color="neutral">{call.groupMembers?.length ? call.groupMembers.length + 1 : 1}</Chip>
                )}
                {screenSharing && (
                    <Chip size="sm" variant="solid" color="warning">Compartiendo</Chip>
                )}
                <Tooltip title={screenSharing ? 'Detener pantalla' : 'Compartir pantalla'}>
                    <IconButton
                        size="sm"
                        variant="plain"
                        color={screenSharing ? 'warning' : 'neutral'}
                        onClick={() => setShowShareOptions((prev) => !prev)}
                    >
                        {screenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                    </IconButton>
                </Tooltip>
                <Tooltip title={expanded ? 'Reducir' : 'Expandir'}>
                    <IconButton size="sm" variant="plain" color="neutral" onClick={() => setExpanded((prev) => !prev)}>
                        {expanded ? <CloseFullscreenIcon /> : <OpenInFullIcon />}
                    </IconButton>
                </Tooltip>
                <Tooltip title="Minimizar">
                    <IconButton size="sm" variant="plain" color="neutral" onClick={onMinimize}>
                        <MinimizeIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Colgar">
                    <IconButton size="sm" variant="plain" color="danger" onClick={onEnd}>
                        <CallEndIcon />
                    </IconButton>
                </Tooltip>
            </Box>

            {showShareOptions && (
                <Box data-nodrag="true" sx={{ position: 'absolute', top: 44, right: 12, zIndex: 2, display: 'flex', flexDirection: 'column', gap: 0.5, p: 0.75, borderRadius: 8, backgroundColor: '#2a2a2a', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                    <Typography level="body-xs" sx={{ px: 1, color: 'rgba(255,255,255,0.7)' }}>Compartir pantalla</Typography>
                    <Box component="button" data-nodrag="true" onClick={() => doShare('screen', true)} sx={shareOptionSx}>Pantalla con sonido</Box>
                    <Box component="button" data-nodrag="true" onClick={() => doShare('screen', false)} sx={shareOptionSx}>Pantalla sin sonido</Box>
                    <Box component="button" data-nodrag="true" onClick={() => doShare('window', true)} sx={shareOptionSx}>Ventana con sonido</Box>
                    <Box component="button" data-nodrag="true" onClick={() => doShare('window', false)} sx={shareOptionSx}>Ventana sin sonido</Box>
                </Box>
            )}

            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 1, overflow: 'hidden', gap: 1 }}>
                {isVideoActive && remoteStream ? (
                    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
                        <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#111', borderRadius: 8 }} />
                        <Box sx={{ position: 'absolute', bottom: 8, right: 8, width: 120, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.4)', backgroundColor: '#000', boxShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
                            {call.cameraEnabled ? (
                                <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#333' }}>
                                    <Avatar sx={{ width: 32, height: 32, fontSize: 14 }}>T</Avatar>
                                </Box>
                            )}
                            <Box sx={{ position: 'absolute', bottom: 2, left: 4, px: 0.5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.6)' }}>
                                <Typography level="body-xs">Tú</Typography>
                            </Box>
                        </Box>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <Avatar src={avatar} size="lg" sx={{ width: 80, height: 80, fontSize: 32 }}>{peerName.charAt(0).toUpperCase()}</Avatar>
                        <Typography level="title-md" sx={{ color: 'white' }}>{peerName}</Typography>
                        <Typography level="body-sm" sx={{ color: 'rgba(255,255,255,0.6)' }}>{formatDuration(seconds)}</Typography>
                    </Box>
                )}
            </Box>

            <Box data-nodrag="true" sx={{ p: 1, display: 'flex', justifyContent: 'center' }}>
                <CallControls muted={call.muted} cameraEnabled={call.cameraEnabled} onToggleMute={onToggleMute} onToggleCamera={onToggleCamera} onEnd={onEnd} />
            </Box>
        </Box>
    );
};

