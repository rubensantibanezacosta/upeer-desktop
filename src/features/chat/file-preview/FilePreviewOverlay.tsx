import React, { useState, useEffect, useRef } from 'react';
import {
    Box, IconButton, Typography, Input, Sheet, Slider,
} from '@mui/joy';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import ImageIcon from '@mui/icons-material/Image';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import DescriptionIcon from '@mui/icons-material/Description';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import AddIcon from '@mui/icons-material/Add';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import { FilePreviewCarousel } from './FilePreviewCarousel.js';
import { DragDropPlaceholder } from './DragDropPlaceholder.js';
import { formatFileSize, getMimeType } from '../../../utils/fileUtils.js';

interface FileInfo {
    path: string;
    name: string;
    size: number;
    type: string;
    lastModified: number;
}

interface FilePreviewOverlayProps {
    files: FileInfo[];
    onClose: () => void;
    onSend: (files: FileInfo[], thumbnails?: (string | undefined)[], captions?: string[]) => void;
    onAddMore: () => void;
    onRemove: (index: number) => void;
    isDragging?: boolean;
    vouchScore?: number;
    onDragOver?: (e: React.DragEvent) => void;
    onDragLeave?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const useFilesPreview = (files: FileInfo[]) => {
    const [previews, setPreviews] = useState<Record<string, { previewUrl: string; thumbnail: string }>>({});
    const [isGenerating, setIsGenerating] = useState(false);

    const generateThumbnail = (imageUrl: string): Promise<string> =>
        new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(''); return; }
                const maxSize = 240;
                let { width, height } = img;
                if (width > height) { if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; } }
                else { if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; } }
                canvas.width = width; canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = () => resolve('');
            img.src = imageUrl;
        });

    const generateVideoThumbnail = (videoUrl: string): Promise<string> =>
        new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = videoUrl;
            video.muted = true;
            video.playsInline = true;

            const timeout = setTimeout(() => {
                video.onseeked = null;
                video.onerror = null;
                resolve('');
            }, 5000);

            video.onloadedmetadata = () => {
                video.currentTime = Math.min(1, video.duration * 0.1);
            };

            video.onseeked = () => {
                clearTimeout(timeout);
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(''); return; }
                const maxSize = 240;
                let { videoWidth: width, videoHeight: height } = video;
                if (width > height) { if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; } }
                else { if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; } }
                canvas.width = width; canvas.height = height;
                ctx.drawImage(video, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };

            video.onerror = () => {
                clearTimeout(timeout);
                resolve('');
            };
        });

    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            if (isMounted) setIsGenerating(true);
            for (const file of files) {
                if (!isMounted) break;
                let effectiveType = file.type;
                if (!effectiveType || effectiveType === 'application/octet-stream') effectiveType = getMimeType(file.name);
                if (!effectiveType.startsWith("image/") && !effectiveType.startsWith("video/")) continue;
                if (previews[file.path]) continue;
                try {
                    const mediaUrl = `media://${file.path}`;
                    let thumbnail = "";
                    if (effectiveType.startsWith("image/")) {
                        thumbnail = await generateThumbnail(mediaUrl);
                    } else if (effectiveType.startsWith("video/")) {
                        try {
                            const result = await (window as any).upeer.generateVideoThumbnail(file.path);
                            thumbnail = result.success ? result.dataUrl : await generateVideoThumbnail(mediaUrl);
                        } catch { thumbnail = await generateVideoThumbnail(mediaUrl); }
                    }
                    if (isMounted) {
                        setPreviews(prev => ({ ...prev, [file.path]: { previewUrl: mediaUrl, thumbnail } }));
                    }
                } catch { /* ignore */ }
            }
            if (isMounted) setIsGenerating(false);
        };
        load();
        return () => { isMounted = false; };
    }, [files, previews]);

    return { previews, isGenerating };
};

// ── File icon helper ──────────────────────────────────────────────────────────

const getFileTypeIcon = (fileType: string, fileName: string, size = 60) => {
    let effectiveType = fileType;
    if (!effectiveType || effectiveType === 'application/octet-stream') {
        effectiveType = getMimeType(fileName);
    }
    if (effectiveType.startsWith('image/')) return <ImageIcon sx={{ fontSize: size }} />;
    if (effectiveType.startsWith('audio/')) return <AudioFileIcon sx={{ fontSize: size }} />;
    if (effectiveType.startsWith('video/')) return <VideoFileIcon sx={{ fontSize: size }} />;
    if (effectiveType.includes('pdf')) return <DescriptionIcon sx={{ fontSize: size }} />;
    return <InsertDriveFileIcon sx={{ fontSize: size }} />;
};

// ── Video Player Component ───────────────────────────────────────────────────

interface VideoPlayerProps {
    src: string;
    name: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, name }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const controlsTimeoutRef = useRef<any>(null);

    const togglePlay = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration);
        }
    };

    const handleSliderChange = (_: any, value: number | number[]) => {
        if (videoRef.current && typeof value === 'number') {
            videoRef.current.currentTime = value;
            setCurrentTime(value);
        }
    };

    const toggleMute = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (videoRef.current) {
            const newMuted = !isMuted;
            videoRef.current.muted = newMuted;
            setIsMuted(newMuted);
        }
    };

    const handleMouseMove = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => {
            if (isPlaying) setShowControls(false);
        }, 2500);
    };

    useEffect(() => {
        return () => {
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        };
    }, []);

    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <Box
            onMouseMove={handleMouseMove}
            onMouseLeave={() => isPlaying && setShowControls(false)}
            sx={{
                position: 'relative',
                width: '100%',
                maxWidth: '90%',
                maxHeight: '60vh',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: '8px',
                overflow: 'hidden',
                bgcolor: 'black',
                boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                '&:hover .video-controls': { opacity: 1 }
            }}
        >
            <video
                ref={videoRef}
                src={src}
                playsInline
                crossOrigin="anonymous"
                style={{
                    maxWidth: '100%',
                    maxHeight: '60vh',
                    display: 'block',
                    cursor: 'pointer'
                }}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
                onClick={() => togglePlay()}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
            />


            {/* Controls Bar */}
            <Box
                className="video-controls"
                sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    p: 1.5,
                    pt: 4,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                    opacity: showControls || !isPlaying ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                    zIndex: 3,
                    pointerEvents: showControls || !isPlaying ? 'auto' : 'none',
                }}
            >
                <Slider
                    size="sm"
                    value={currentTime}
                    max={duration || 100}
                    onChange={handleSliderChange}
                    sx={{
                        mx: 1,
                        width: 'calc(100% - 16px)',
                        color: 'primary.400',
                        '--Slider-trackSize': '4px',
                        '& .MuiSlider-thumb': {
                            width: 12,
                            height: 12,
                            transition: 'transform 0.2s',
                            '&:hover': { transform: 'scale(1.2)' }
                        },
                    }}
                />

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

// ── Component ─────────────────────────────────────────────────────────────────

export const FilePreviewOverlay: React.FC<FilePreviewOverlayProps> = ({
    files, onClose, onSend, onAddMore, onRemove,
    isDragging, vouchScore, onDragOver, onDragLeave, onDrop,
}) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [captions, setCaptions] = useState<Record<number, string>>({});
    const { previews, isGenerating } = useFilesPreview(files);

    useEffect(() => {
        if (selectedIndex >= files.length) setSelectedIndex(Math.max(0, files.length - 1));
    }, [files.length, selectedIndex]);

    const currentFile = files[selectedIndex];
    const currentPreview = currentFile ? previews[currentFile.path] : null;

    const handleSendAll = () => {
        const thumbnails = files.map(f => previews[f.path]?.thumbnail);
        const caps = files.map((_, i) => captions[i] || '');
        onSend(files, thumbnails, caps);
    };

    const sheetSx = {
        position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 1300, display: 'flex', flexDirection: 'column' as const,
        backgroundColor: 'rgba(var(--joy-palette-neutral-900Channel, 0 0 0) / 0.95)',
        backdropFilter: 'blur(10px)',
    };

    // Empty drag-only state
    if (!currentFile) {
        if (!isDragging) return null;
        return (
            <Sheet variant="solid" color="neutral" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} sx={sheetSx}>
                <DragDropPlaceholder onClose={onClose} />
            </Sheet>
        );
    }

    return (
        <Sheet variant="solid" color="neutral" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} sx={sheetSx}>
            {/* Drop overlay on top of existing files */}
            {isDragging && (
                <Box sx={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'background.backdrop', backdropFilter: 'blur(6px)',
                    zIndex: 2000, display: 'flex', flexDirection: 'column', p: 4, pointerEvents: 'none',
                }}>
                    <Box sx={{
                        flexGrow: 1, display: 'flex', flexDirection: 'column',
                        justifyContent: 'center', alignItems: 'center',
                        border: '2px dashed', borderColor: 'divider', borderRadius: 'xl',
                        backgroundColor: 'background.level1', transition: 'all 0.2s ease-in-out',
                    }}>
                        <AddIcon sx={{ fontSize: 48, color: 'text.primary', mb: 2 }} />
                        <Typography level="h3" sx={{ color: 'text.primary', fontWeight: 500 }}>Suelta para añadir archivos</Typography>
                    </Box>
                </Box>
            )}

            {/* Header */}
            <Box sx={{ p: 2, display: 'flex', alignItems: 'center' }}>
                <IconButton variant="plain" color="neutral" onClick={onClose} sx={{ color: 'text.primary', '&:hover': { backgroundColor: 'background.level2' } }}>
                    <CloseIcon />
                </IconButton>
                <Box sx={{ flexGrow: 1, textAlign: 'center' }}>
                    <Typography level="body-sm" sx={{ color: 'text.primary', fontWeight: 'md' }}>{currentFile.name}</Typography>
                </Box>
                <Box sx={{ width: 40 }} />
            </Box>

            {/* Preview area */}
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 4, overflow: 'hidden' }}>
                {currentPreview?.previewUrl ? (
                    (currentFile.type.startsWith('video/') || getMimeType(currentFile.name).startsWith('video/')) ? (
                        <VideoPlayer src={currentPreview.previewUrl} name={currentFile.name} />
                    ) : (
                        <Box component="img" src={currentPreview.previewUrl} sx={{ maxWidth: '90%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 'md', boxShadow: 'lg', transition: 'all 0.3s ease' }} />
                    )
                ) : (
                    <Box sx={{ p: 6, borderRadius: 'lg', backgroundColor: 'background.level1', color: 'primary.main', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: 'sm', width: 280, height: 280 }}>
                        {getFileTypeIcon(currentFile.type, currentFile.name, 100)}
                        <Typography level="body-md" sx={{ mt: 2, color: 'text.secondary' }}>No hay vista previa disponible</Typography>
                        <Typography level="body-xs" sx={{ mt: 1, color: 'text.tertiary' }}>
                            {formatFileSize(currentFile.size)} - {(currentFile.type === 'application/octet-stream' ? getMimeType(currentFile.name) : currentFile.type).split('/')[1]?.toUpperCase() || 'FILE'}
                        </Typography>
                    </Box>
                )}
            </Box>

            {/* Footer */}
            <Box sx={{ p: 2, backgroundColor: 'background.surface', borderTop: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Reputation Warning for Large Files */}
                {currentFile && currentFile.size > 10 * 1024 * 1024 && (vouchScore || 0) < 30 && (
                    <Box sx={{
                        display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1,
                        backgroundColor: 'danger.softBg', borderRadius: 'md', mx: 'auto',
                        border: '1px solid', borderColor: 'danger.softBorder', maxWidth: 600, width: '100%'
                    }}>
                        <WarningAmberIcon sx={{ color: 'danger.main', fontSize: 20 }} />
                        <Typography level="body-xs" sx={{ color: 'danger.plainColor', fontWeight: 600 }}>
                            Este archivo es grande ({formatFileSize(currentFile.size)}).
                            El contacto tiene baja reputación ({vouchScore ?? 0}) y el autivismo offline (vault) está deshabilitado.
                            Ambos deben estar online para transferirlo.
                        </Typography>
                    </Box>
                )}

                {/* Caption + Send */}
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Box sx={{ width: '100%', maxWidth: 600, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Input
                            size="lg" variant="outlined" color="neutral"
                            placeholder="Añade un comentario..."
                            value={captions[selectedIndex] || ''}
                            onChange={(e) => setCaptions(prev => ({ ...prev, [selectedIndex]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isGenerating) handleSendAll(); }}
                            sx={{ flexGrow: 1, borderRadius: 'lg' }}
                            disabled={isGenerating}
                        />
                        <IconButton variant="plain" color={isGenerating ? 'neutral' : 'primary'} onClick={handleSendAll} disabled={isGenerating}>
                            <SendIcon />
                        </IconButton>
                    </Box>
                </Box>

                {/* Carousel */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, pb: 2 }}>
                    <FilePreviewCarousel
                        files={files}
                        selectedIndex={selectedIndex}
                        previews={previews}
                        onSelect={setSelectedIndex}
                        onRemove={onRemove}
                        onAddMore={onAddMore}
                    />
                </Box>
            </Box>

            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </Sheet>
    );
};
