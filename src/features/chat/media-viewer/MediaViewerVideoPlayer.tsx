import React, { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Slider, Typography } from '@mui/joy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';

interface MediaViewerVideoPlayerProps {
    src: string;
    fileName: string;
    onVideoError?: () => void;
}

export const MediaViewerVideoPlayer: React.FC<MediaViewerVideoPlayerProps> = ({ src, fileName, onVideoError }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const controlsTimeoutRef = useRef<number | null>(null);

    const togglePlay = (event?: React.MouseEvent) => {
        if (event) {
            event.stopPropagation();
        }
        if (!videoRef.current) {
            return;
        }
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            void videoRef.current.play();
        }
    };

    const toggleMute = (event: React.MouseEvent) => {
        event.stopPropagation();
        if (!videoRef.current) {
            return;
        }
        const nextMuted = !isMuted;
        videoRef.current.muted = nextMuted;
        setIsMuted(nextMuted);
    };

    const handleMouseMove = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) {
            window.clearTimeout(controlsTimeoutRef.current);
        }
        controlsTimeoutRef.current = window.setTimeout(() => {
            if (isPlaying) {
                setShowControls(false);
            }
        }, 3000);
    };

    useEffect(() => () => {
        if (controlsTimeoutRef.current) {
            window.clearTimeout(controlsTimeoutRef.current);
        }
    }, []);

    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <Box onMouseMove={handleMouseMove} onMouseLeave={() => isPlaying && setShowControls(false)} sx={{ position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: 'black' }}>
            <video
                ref={videoRef}
                src={src}
                autoPlay
                playsInline
                crossOrigin="anonymous"
                style={{ maxWidth: '100%', maxHeight: '100%', display: 'block', cursor: 'pointer' }}
                onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
                onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
                onEnded={() => setIsPlaying(false)}
                onClick={() => togglePlay()}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={() => onVideoError?.()}
            />

            <Box className="video-controls" sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, p: 2, pt: 6, background: 'linear-gradient(to top, rgba(0,0,0,0.95), transparent)', display: 'flex', flexDirection: 'column', gap: 1, opacity: showControls || !isPlaying ? 1 : 0, transition: 'opacity 0.4s ease', zIndex: 10, pointerEvents: showControls || !isPlaying ? 'auto' : 'none' }}>
                <Slider size="sm" value={currentTime} max={duration || 100} onChange={(_, value) => {
                    if (videoRef.current && typeof value === 'number') {
                        videoRef.current.currentTime = value;
                        setCurrentTime(value);
                    }
                }} sx={{ mx: 1, width: 'calc(100% - 16px)', color: 'primary.400', '--Slider-trackSize': '4px', '& .MuiSlider-thumb': { width: 14, height: 14, transition: 'transform 0.2s', '&:hover': { transform: 'scale(1.25)' } } }} />

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconButton size="sm" variant="plain" color="neutral" onClick={togglePlay} sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' } }}>
                            {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
                        </IconButton>
                        <IconButton size="sm" variant="plain" color="neutral" onClick={toggleMute} sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' } }}>
                            {isMuted ? <VolumeOffIcon /> : <VolumeUpIcon />}
                        </IconButton>
                        <Typography level="body-sm" sx={{ color: 'white', fontWeight: 600, ml: 1, letterSpacing: '0.5px' }}>
                            {formatTime(currentTime)} <Box component="span" sx={{ opacity: 0.5, mx: 0.5 }}>/</Box> {formatTime(duration)}
                        </Typography>
                    </Box>
                    <Typography level="body-xs" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 'md', pr: 1 }}>
                        {fileName}
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
};