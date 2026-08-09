import React, { useEffect, useRef, useState } from 'react';
import { Avatar, Box, Chip, Typography } from '@mui/joy';
import { CallControls } from './CallControls.js';
import { useCallMedia } from './useCallMedia.js';
import type { ActiveCallView } from './useCall.js';

interface CallOverlayProps {
    call: ActiveCallView;
    peerName: string;
    avatar?: string;
    participants?: Array<{ id: string; name: string; avatar?: string }>;
    onToggleMute: () => void;
    onToggleCamera: () => void;
    onEnd: () => void;
    onMinimize: () => void;
}

function useElapsed(startedAtRef: number | null): number {
    const [seconds, setSeconds] = useState(0);
    useEffect(() => {
        if (startedAtRef === null) {
            return;
        }
        const timer = setInterval(() => {
            setSeconds(Math.floor((Date.now() - startedAtRef) / 1000));
        }, 1000);
        return () => clearInterval(timer);
    }, [startedAtRef]);
    return seconds;
}

function formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({ call, peerName, avatar, participants, onToggleMute, onToggleCamera, onEnd, onMinimize }) => {
    const [startedAt] = useState<number>(Date.now());
    const elapsed = useElapsed(startedAt);
    const videoRef = useRef<HTMLVideoElement>(null);
    const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const nextStartRef = useRef(0);
    const media = useCallMedia();
    const { startLocalCapture, stopLocalCapture, setOnRemoteFrame, localStream } = media;
    const phaseLabel = call.phase === 'negotiating' ? 'Conectando…' : (call.phase === 'outgoing-ringing' ? 'Llamando…' : 'En curso');
    const isVideo = call.kind === 'video';
    const isGroup = call.isGroup === true;
    const memberCount = isGroup && Array.isArray(call.groupMembers) ? call.groupMembers.length + 1 : (participants ? participants.length : 1);

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

    return (
        <Box
            sx={{
                position: 'fixed',
                inset: 0,
                zIndex: 1300,
                backgroundColor: 'rgba(0,0,0,0.9)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                color: 'white',
                p: 2,
            }}
        >
            <Box sx={{ position: 'absolute', top: 12, left: 20, display: 'flex', alignItems: 'center', gap: 1.5, width: 'calc(100% - 40px)' }}>
                <Typography level="title-md" sx={{ color: 'white' }}>{peerName}</Typography>
                <Chip size="sm" variant="soft" color="neutral">{memberCount}</Chip>
                <Box sx={{ flex: 1 }} />
                <Chip size="sm" variant="outlined" sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.4)', cursor: 'pointer' }} onClick={onMinimize}>Minimizar</Chip>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: isGroup ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr', gap: 2, width: '100%', maxWidth: 1200, alignItems: 'center' }}>
                {isGroup && Array.isArray(call.groupMembers) && call.groupMembers.map((memberId, idx) => (
                    <Box key={memberId} sx={{ position: 'relative', width: '100%', aspectRatio: '16/9', backgroundColor: '#1a1a1a', borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {idx === 0 && isVideo ? (
                            <canvas ref={remoteCanvasRef} style={{ width: '100%', height: '100%', backgroundColor: '#111' }} />
                        ) : (
                            <Avatar sx={{ width: 56, height: 56, fontSize: 24 }}>{memberId.charAt(0).toUpperCase()}</Avatar>
                        )}
                        <Box sx={{ position: 'absolute', bottom: 8, left: 8, px: 1, py: 0.25, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.6)' }}>
                            <Typography level="body-xs">{memberId.slice(0, 6)}</Typography>
                        </Box>
                    </Box>
                ))}

                {!isGroup && isVideo && (
                    <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
                        <canvas ref={remoteCanvasRef} style={{ width: '100%', height: '100%', backgroundColor: '#111', borderRadius: 12 }} />
                        <Box sx={{ position: 'absolute', bottom: 12, right: 12, width: 180, height: 120, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.3)' }}>
                            <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </Box>
                    </Box>
                )}

                {!isGroup && !isVideo && (
                    <>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <Avatar src={avatar} size="lg" sx={{ width: 120, height: 120, fontSize: 48 }}>{peerName.charAt(0).toUpperCase()}</Avatar>
                            <Typography level="h3" sx={{ color: 'white' }}>{peerName}</Typography>
                        </Box>
                        <Box sx={{ position: 'absolute', bottom: 12, right: 12, width: 180, height: 120, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.3)' }}>
                            <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </Box>
                    </>
                )}
            </Box>

            <Typography level="body-md" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                {phaseLabel} · {formatDuration(elapsed)}
            </Typography>
            <CallControls muted={call.muted} cameraEnabled={call.cameraEnabled} onToggleMute={onToggleMute} onToggleCamera={onToggleCamera} onEnd={onEnd} />
        </Box>
    );
};

