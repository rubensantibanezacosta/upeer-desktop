import React, { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Typography, CircularProgress } from '@mui/joy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import WaveSurfer from 'wavesurfer.js';
import { MessageStatus } from '../message/MessageStatus.js';

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

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    useEffect(() => {
        if (!containerRef.current) return;

        const ws = WaveSurfer.create({
            container: containerRef.current,
            waveColor: isMe ? 'rgba(255, 255, 255, 0.4)' : 'rgba(74, 158, 255, 0.4)',
            progressColor: isMe ? 'rgba(255, 255, 255, 1)' : 'rgba(74, 158, 255, 1)',
            cursorColor: isMe ? '#ffffff' : '#4a9eff',
            cursorWidth: 2,
            barWidth: 2,
            barGap: 2,
            barRadius: 2,
            height: 18,
            normalize: true,
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
            p: 0.5,
            minWidth: '260px',
            maxWidth: '320px',
        }}>
            <IconButton
                variant="plain"
                color={isMe ? 'neutral' : 'primary'}
                onClick={handlePlayPause}
                sx={{
                    color: isMe ? 'white' : 'primary.main',
                    width: 32,
                    height: 32,
                    flexShrink: 0,
                    '&:hover': { bgcolor: isMe ? 'rgba(255,255,255,0.1)' : undefined }
                }}
            >
                {isLoading ? (
                    <CircularProgress size="sm" variant="plain" sx={{ color: 'inherit' }} />
                ) : isPlaying ? (
                    <PauseIcon sx={{ fontSize: '24px' }} />
                ) : (
                    <PlayArrowIcon sx={{ fontSize: '24px' }} />
                )}
            </IconButton>

            {/* Waveform + info row */}
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0, gap: 0.3 }}>

                <Box
                    ref={containerRef}
                    sx={{
                        width: '95%',
                        cursor: 'pointer',
                        height: '22px',
                        position: 'relative',
                        transform: 'translateY(13px)',
                        mb: 1,
          
                    }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography level="body-xs" sx={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'text.tertiary', fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}>
                        {isPlaying ? currentTime : duration}
                    </Typography>
                    {timestamp && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, opacity: 0.8 }}>
                            <Typography level="body-xs" sx={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'text.tertiary', fontSize: '10px' }}>
                                {timestamp}
                            </Typography>
                            {isMe && <MessageStatus status={status || 'sent'} />}
                        </Box>
                    )}
                </Box>
            </Box>
        </Box>
    );
};
