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
    const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
    const screenCanvasRef = useRef<HTMLCanvasElement>(null);
    const peerCanvasRefs = useRef(new Map<string, HTMLCanvasElement>());
    const remoteCanvasSourcesRef = useRef(new Map<string, HTMLCanvasElement>());
    const screenCanvasSourceRef = useRef<HTMLCanvasElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const nextAudioTimeRef = useRef(0);
    const [remotePeers, setRemotePeers] = useState<string[]>([]);
    const [remoteScreen, setRemoteScreen] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [showShareOptions, setShowShareOptions] = useState(false);
    const media = useCallMedia(call.callId ?? '');
    const { startLocalCapture, stopLocalCapture, setOnRemoteFrame, localStream, startScreenShare, stopScreenShare, screenSharing, setVideoEnabled, setAudioEnabled } = media;

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

    const attachVideoCanvas = useCallback((peerUpeerId: string, element: HTMLCanvasElement | null) => {
        if (!element) {
            peerCanvasRefs.current.delete(peerUpeerId);
            return;
        }
        peerCanvasRefs.current.set(peerUpeerId, element);
        const previousFrame = remoteCanvasSourcesRef.current.get(peerUpeerId);
        if (previousFrame) {
            element.width = previousFrame.width;
            element.height = previousFrame.height;
            element.getContext('2d')?.drawImage(previousFrame, 0, 0);
        }
    }, []);

    const attachScreenCanvas = useCallback((element: HTMLCanvasElement | null) => {
        screenCanvasRef.current = element;
        const source = screenCanvasSourceRef.current;
        if (element && source) {
            element.width = source.width;
            element.height = source.height;
            element.getContext('2d')?.drawImage(source, 0, 0);
        }
    }, []);

    const drawRemoteVideo = useCallback((kind: 'video' | 'screen', frame: VideoFrame, peerUpeerId: string) => {
        const sourceCanvas = kind === 'screen'
            ? screenCanvasSourceRef.current ?? document.createElement('canvas')
            : remoteCanvasSourcesRef.current.get(peerUpeerId) ?? document.createElement('canvas');
        if (kind === 'video') remoteCanvasSourcesRef.current.set(peerUpeerId, sourceCanvas);
        else screenCanvasSourceRef.current = sourceCanvas;
        sourceCanvas.width = frame.displayWidth;
        sourceCanvas.height = frame.displayHeight;
        sourceCanvas.getContext('2d')?.drawImage(frame, 0, 0);
        const target = kind === 'screen'
            ? screenCanvasRef.current
            : isGroup ? peerCanvasRefs.current.get(peerUpeerId) : remoteCanvasRef.current;
        if (target && target !== sourceCanvas) {
            target.width = sourceCanvas.width;
            target.height = sourceCanvas.height;
            target.getContext('2d')?.drawImage(sourceCanvas, 0, 0);
        }
        if (kind === 'video') {
            setRemotePeers((current) => current.includes(peerUpeerId) ? current : [...current, peerUpeerId]);
        } else {
            setRemoteScreen(peerUpeerId);
        }
        frame.close();
    }, [isGroup]);

    const playRemoteAudio = useCallback((audioData: AudioData) => {
        const context = audioContextRef.current ?? new AudioContext();
        audioContextRef.current = context;
        const buffer = context.createBuffer(audioData.numberOfChannels, audioData.numberOfFrames, audioData.sampleRate);
        for (let channel = 0; channel < audioData.numberOfChannels; channel += 1) {
            audioData.copyTo(buffer.getChannelData(channel), { planeIndex: channel });
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        const startAt = Math.max(nextAudioTimeRef.current, context.currentTime);
        source.start(startAt);
        nextAudioTimeRef.current = startAt + buffer.duration;
        audioData.close();
    }, []);

    useEffect(() => {
        if (videoRef.current && localStream) videoRef.current.srcObject = localStream;
    }, [localStream]);

    useEffect(() => {
        if (call.phase !== 'negotiating' && call.phase !== 'connected') return;
        const remoteCanvasSources = remoteCanvasSourcesRef.current;
        setOnRemoteFrame((kind, decoded, peerUpeerId) => {
            if (kind === 'audio') playRemoteAudio(decoded as AudioData);
            else drawRemoteVideo(kind, decoded as VideoFrame, peerUpeerId);
        });
        void startLocalCapture(isVideo);
        return () => {
            setOnRemoteFrame(null);
            stopLocalCapture();
            stopScreenShare();
            setRemotePeers([]);
            remoteCanvasSources.clear();
            screenCanvasSourceRef.current = null;
            setRemoteScreen(null);
            void audioContextRef.current?.close();
            audioContextRef.current = null;
            nextAudioTimeRef.current = 0;
        };
    }, [call.callId, call.phase, isVideo, setOnRemoteFrame, startLocalCapture, stopLocalCapture, stopScreenShare, drawRemoteVideo, playRemoteAudio]);

    useEffect(() => {
        if (call.phase !== 'connected') return;
        void setVideoEnabled(call.cameraEnabled);
    }, [call.phase, call.cameraEnabled, setVideoEnabled]);

    useEffect(() => {
        if (call.phase !== 'connected') return;
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
                {isGroup && isVideoActive ? (
                    <Box sx={{ width: '100%', height: '100%', overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gridAutoRows: 'minmax(110px, 1fr)', gap: 1 }}>
                        {remoteScreen && (
                            <Box sx={{ position: 'relative', borderRadius: 8, overflow: 'hidden', backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.3)' }}>
                                <canvas ref={attachScreenCanvas} style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#111' }} />
                                <Chip size="sm" color="warning" sx={{ position: 'absolute', top: 8, left: 8 }}>{remoteScreen.slice(0, 8)} comparte pantalla</Chip>
                            </Box>
                        )}
                        <Box sx={{ position: 'relative', borderRadius: 8, overflow: 'hidden', backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.3)' }}>
                            {call.cameraEnabled && localStream ? (
                                <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#333' }}>
                                    <Avatar sx={{ width: 40, height: 40, fontSize: 16 }}>T</Avatar>
                                </Box>
                            )}
                            <Box sx={{ position: 'absolute', bottom: 4, left: 6, px: 0.5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.6)' }}>
                                <Typography level="body-xs">Tú</Typography>
                            </Box>
                        </Box>
                        {remotePeers.map((pid) => (
                            <Box key={pid} sx={{ position: 'relative', borderRadius: 8, overflow: 'hidden', backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.12)' }}>
                                <canvas ref={(element) => attachVideoCanvas(pid, element)} style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#111' }} />
                                <Box sx={{ position: 'absolute', bottom: 4, left: 6, px: 0.5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.6)' }}>
                                    <Typography level="body-xs" sx={{ color: 'white' }}>{pid.slice(0, 8)}</Typography>
                                </Box>
                            </Box>
                        ))}
                        {remotePeers.length === 0 && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, gridColumn: '1 / -1' }}>
                                <Avatar size="lg" sx={{ width: 72, height: 72, fontSize: 28 }}>{peerName.charAt(0).toUpperCase()}</Avatar>
                                <Typography level="title-md" sx={{ color: 'white' }}>{peerName}</Typography>
                                <Typography level="body-sm" sx={{ color: 'rgba(255,255,255,0.6)' }}>{formatDuration(seconds)}</Typography>
                            </Box>
                        )}
                    </Box>
                ) : isVideoActive ? (
                    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
                        {remoteScreen ? (
                            <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
                                <canvas ref={attachScreenCanvas} style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#111', borderRadius: 8 }} />
                                <Chip size="sm" color="warning" sx={{ position: 'absolute', top: 8, left: 8 }}>{remoteScreen.slice(0, 8)} comparte pantalla</Chip>
                            </Box>
                        ) : remotePeers.length > 0 ? (
                            <canvas ref={remoteCanvasRef} style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#111', borderRadius: 8 }} />
                        ) : (
                            <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                                <Avatar src={avatar} size="lg" sx={{ width: 80, height: 80, fontSize: 32 }}>{peerName.charAt(0).toUpperCase()}</Avatar>
                                <Typography level="title-md" sx={{ color: 'white' }}>{peerName}</Typography>
                                <Typography level="body-sm" sx={{ color: 'rgba(255,255,255,0.6)' }}>{formatDuration(seconds)}</Typography>
                            </Box>
                        )}
                        <Box sx={{ position: 'absolute', bottom: 8, right: 8, width: 120, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.4)', backgroundColor: '#000', boxShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>
                            {call.cameraEnabled && localStream ? (
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