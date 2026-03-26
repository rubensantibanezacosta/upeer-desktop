import React, { useEffect, useRef, useState } from 'react';
import { Box, IconButton, Slider, Typography } from '@mui/joy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';

interface FilePreviewVideoPlayerProps {
    src: string;
    name: string;
}

export const FilePreviewVideoPlayer: React.FC<FilePreviewVideoPlayerProps> = ({ src, name }) => {
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

    const handleSliderChange = (_: Event, value: number | number[]) => {
        if (videoRef.current && typeof value === 'number') {
            videoRef.current.currentTime = value;
            setCurrentTime(value);
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
        }, 2500);
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
        <Box onMouseMove={handleMouseMove} onMouseLeave={() => isPlaying && setShowControls(false)} sx={{ position: 'relative', width: '100%', maxWidth: '90%', maxHeight: '60vh', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '8px', overflow: 'hidden', bgcolor: 'black', boxShadow: '0 8px 30px rgba(0,0,0,0.3)', '&:hover .video-controls': { opacity: 1 } }}>
            <video
                ref={videoRef}
                src={src}
                playsInline
                crossOrigin="anonymous"
                style={{ maxWidth: '100%', maxHeight: '60vh', display: 'block', cursor: 'pointer' }}
                onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
                onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
                onEnded={() => setIsPlaying(false)}
                onClick={() => togglePlay()}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
            />

            <Box className="video-controls" sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, p: 1.5, pt: 4, background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', display: 'flex', flexDirection: 'column', gap: 0.5, opacity: showControls || !isPlaying ? 1 : 0, transition: 'opacity 0.3s ease', zIndex: 3, pointerEvents: showControls || !isPlaying ? 'auto' : 'none' }}>
                <Slider size="sm" value={currentTime} max={duration || 100} onChange={handleSliderChange} sx={{ mx: 1, width: 'calc(100% - 16px)', color: 'primary.400', '--Slider-trackSize': '4px', '& .MuiSlider-thumb': { width: 12, height: 12, transition: 'transform 0.2s', '&:hover': { transform: 'scale(1.2)' } } }} />

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <IconButton size="sm" variant="plain" color="neutral" onClick={togglePlay} sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                            {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
                        </IconButton>
                        <IconButton size="sm" variant="plain" color="neutral" onClick={toggleMute} sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                            {isMuted ? <VolumeOffIcon /> : <VolumeUpIcon />}
                        </IconButton>
                        <Typography level="body-xs" sx={{ color: 'white', fontWeight: 500, ml: 1 }}>
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </Typography>
                    </Box>

                    <Typography level="body-xs" sx={{ color: 'rgba(255,255,255,0.5)', pr: 1, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name}
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
};