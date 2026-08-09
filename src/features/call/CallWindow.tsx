import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar, Box, Chip, IconButton, Tooltip, Typography } from '@mui/joy';
import MinimizeIcon from '@mui/icons-material/Minimize';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CloseFullscreenIcon from '@mui/icons-material/CloseFullscreen';
import CallEndIcon from '@mui/icons-material/CallEnd';
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
    const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const nextStartRef = useRef(0);
    const media = useCallMedia();
    const { startLocalCapture, stopLocalCapture, setOnRemoteFrame, localStream } = media;

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
        setOnRemoteFrame((kind, frame) => {
            if (kind === 'video') {
                const canvas = remoteCanvasRef.current;
                const videoFrame = frame as { displayWidth?: number; displayHeight?: number; close?: () => void };
                if (!canvas || !videoFrame || typeof videoFrame.displayWidth !== 'number' || typeof videoFrame.displayHeight !== 'number') {
                    return;
                }
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return;
                }
                canvas.width = videoFrame.displayWidth;
                canvas.height = videoFrame.displayHeight;
                (ctx as CanvasRenderingContext2D).drawImage(videoFrame as unknown as CanvasImageSource, 0, 0);
                videoFrame.close?.();
                return;
            }
            const audioData = frame as { sampleRate: number; numberOfFrames: number; numberOfChannels: number; copyTo: (dest: Float32Array, opts: { planeIndex: number }) => void; close?: () => void };
            if (typeof audioData.sampleRate !== 'number' || typeof audioData.copyTo !== 'function') {
                return;
            }
            const audioCtx = audioCtxRef.current ?? new AudioContext();
            audioCtxRef.current = audioCtx;
            const channels = Math.max(1, audioData.numberOfChannels);
            const buffer = audioCtx.createBuffer(channels, audioData.numberOfFrames, audioData.sampleRate);
            for (let channel = 0; channel < channels; channel++) {
                audioData.copyTo(buffer.getChannelData(channel), { planeIndex: channel });
            }
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            const startAt = Math.max(nextStartRef.current, audioCtx.currentTime);
            source.start(startAt);
            nextStartRef.current = startAt + buffer.duration;
            audioData.close?.();
        });
        void startLocalCapture(isVideo);
        return () => {
            setOnRemoteFrame(null);
            stopLocalCapture();
            audioCtxRef.current?.close();
            audioCtxRef.current = null;
            nextStartRef.current = 0;
        };
    }, [call.phase, isVideo, startLocalCapture, stopLocalCapture, setOnRemoteFrame]);

    useEffect(() => {
        if (videoRef.current && localStream) {
            videoRef.current.srcObject = localStream;
        }
    }, [localStream]);

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


            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1, overflow: 'hidden' }}>
                {isGroup ? (
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 1, width: '100%', height: '100%', alignItems: 'center' }}>
                        {call.groupMembers?.map((memberId, idx) => (
                            <Box key={memberId} sx={{ position: 'relative', width: '100%', aspectRatio: '16/9', backgroundColor: '#2a2a2a', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {idx === 0 && isVideoActive ? (
                                    <canvas ref={remoteCanvasRef} style={{ width: '100%', height: '100%', backgroundColor: '#111' }} />
                                ) : (
                                    <Avatar sx={{ width: 40, height: 40, fontSize: 18 }}>{memberId.charAt(0).toUpperCase()}</Avatar>
                                )}
                                <Box sx={{ position: 'absolute', bottom: 4, left: 4, px: 0.5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.6)' }}>
                                    <Typography level="body-xs">{memberId.slice(0, 6)}</Typography>
                                </Box>
                            </Box>
                        ))}
                    </Box>
                ) : isVideoActive ? (
                    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
                        <canvas ref={remoteCanvasRef} style={{ width: '100%', height: '100%', backgroundColor: '#111', borderRadius: 8 }} />
                        <Box sx={{ position: 'absolute', bottom: 8, right: 8, width: 96, height: 64, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.3)', backgroundColor: '#000' }}>
                            <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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

