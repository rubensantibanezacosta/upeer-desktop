import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, IconButton, Typography, CircularProgress } from '@mui/joy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import WaveSurfer from 'wavesurfer.js';
import { MessageStatus } from '../message/MessageStatus.js';

const SPEEDS = [1, 1.5, 2] as const;
type Speed = typeof SPEEDS[number];

interface AudioPlayerProps {
    url: string;
    isMe: boolean;
    timestamp?: string;
    status?: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ url, isMe, timestamp, status }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const wavesurferRef = useRef<WaveSurfer | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState('0:00');
    const [duration, setDuration] = useState('0:00');
    const [isLoading, setIsLoading] = useState(true);
    const [playbackRate, setPlaybackRate] = useState<Speed>(1);

    const cycleSpeed = useCallback(() => {
        setPlaybackRate(prev => {
            const next = SPEEDS[(SPEEDS.indexOf(prev) + 1) % SPEEDS.length];
            if (wavesurferRef.current) {
                wavesurferRef.current.setPlaybackRate(next);
            }
            return next;
        });
    }, []);

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    useEffect(() => {
        if (!containerRef.current) return;

        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: isMe ? '#ffffff80' : '#4a9eff80',
            progressColor: isMe ? '#ffffff' : '#4a9eff',
            cursorColor: 'transparent',
            barWidth: 2,
            barRadius: 3,
            cursorWidth: 1,
            height: 30,
            barGap: 3,
            url: url,
        });

        wavesurferRef.current = ws;

        ws.on('ready', () => {
            setIsLoading(false);
            setDuration(formatTime(ws.getDuration()));
        });

        ws.on('audioprocess', () => {
            setCurrentTime(formatTime(ws.getCurrentTime()));
        });

        ws.on('finish', () => {
            setIsPlaying(false);
            ws.setTime(0);
        });

        ws.on('play', () => setIsPlaying(true));
        ws.on('pause', () => setIsPlaying(false));

        return () => {
            ws.destroy();
        };
    }, [url, isMe]);

    const handlePlayPause = () => {
        if (wavesurferRef.current) {
            wavesurferRef.current.playPause();
        }
    };

    return (
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            py: 0.5,
            px: 1,
            minWidth: '220px',
            maxWidth: '300px'
        }}>
            <IconButton
                variant="plain"
                color={isMe ? 'neutral' : 'primary'}
                onClick={handlePlayPause}
                sx={{
                    color: isMe ? 'white' : 'primary.main',
                    '&:hover': { bgcolor: isMe ? 'rgba(255,255,255,0.1)' : undefined }
                }}
            >
                {isLoading ? (
                    <CircularProgress size="sm" variant="plain" />
                ) : isPlaying ? (
                    <PauseIcon sx={{ fontSize: '28px' }} />
                ) : (
                    <PlayArrowIcon sx={{ fontSize: '28px' }} />
                )}
            </IconButton>

            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 0.2 }}>
                <Box ref={containerRef} sx={{ width: '100%', cursor: 'pointer' }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 0.2 }}>
                    <Typography level="body-xs" sx={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'text.tertiary', fontSize: '10px' }}>
                        {isPlaying ? currentTime : duration}
                    </Typography>
                    {timestamp && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography level="body-xs" sx={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'text.tertiary', fontSize: '10px', opacity: 0.8 }}>
                                {timestamp}
                            </Typography>
                            {isMe && <MessageStatus status={status || 'sent'} />}
                        </Box>
                    )}
                </Box>
            </Box>

            {!isLoading && (
                <IconButton
                    variant="plain"
                    color={isMe ? 'neutral' : 'primary'}
                    onClick={cycleSpeed}
                    sx={{
                        color: isMe ? 'white' : 'primary.main',
                        fontSize: '11px',
                        fontWeight: 700,
                        '&:hover': { bgcolor: isMe ? 'rgba(255,255,255,0.1)' : undefined }
                    }}
                >
                    {playbackRate === 1 ? '1×' : `${playbackRate}×`}
                </IconButton>
            )}
        </Box>
    );
};
