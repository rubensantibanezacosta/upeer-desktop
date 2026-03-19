import React, { useEffect, useState, useRef } from 'react';
import { Box, IconButton, Sheet, Typography, CircularProgress, Slider, Avatar, Tooltip, Stack, Button } from '@mui/joy';
import CloseIcon from '@mui/icons-material/Close';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ReplyIcon from '@mui/icons-material/Reply';
import ShortcutOutlinedIcon from '@mui/icons-material/ShortcutOutlined';
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👎'];

interface MediaItem {
    url: string;
    fileName: string;
    mimeType: string;
    fileId: string;
    messageId?: string;
    thumbnail?: string;
    senderName?: string;
    senderAvatar?: string;
    timestamp?: string;
}

interface MediaViewerOverlayProps {
    items: MediaItem[];
    initialIndex: number;
    onClose: () => void;
    onDownload: (item: MediaItem) => void;
    onReply?: (item: MediaItem) => void;
    onForward?: (item: MediaItem) => void;
    onReact?: (item: MediaItem, emoji: string) => void;
    onGoToMessage?: (item: MediaItem) => void;
}

const isVideo = (mime: string, fileName?: string) => {
    const m = mime.toLowerCase();
    const ext = fileName ? fileName.split('.').pop()?.toLowerCase() : '';
    return m.startsWith('video/') || m === 'video/x-matroska' || ext === 'mkv';
};

// ── Video Player Component ───────────────────────────────────────────────────

const VideoPlayerWithControls: React.FC<{ src: string; fileName: string; onVideoError?: () => void }> = ({ src, fileName, onVideoError }) => {
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
            if (isPlaying) videoRef.current.pause();
            else videoRef.current.play();
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current) setDuration(videoRef.current.duration);
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
        }, 3000);
    };

    useEffect(() => {
        return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
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
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                bgcolor: 'black',
            }}
        >
            <video
                ref={videoRef}
                src={src}
                autoPlay
                playsInline
                crossOrigin="anonymous"
                style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    display: 'block',
                    cursor: 'pointer'
                }}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
                onClick={() => togglePlay()}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={(e) => {
                    console.error('[VideoPlayer] Error loading video source:', e);
                    if (onVideoError) onVideoError();
                }}
            />

            {/* Controls Bar */}
            <Box
                className="video-controls"
                sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    p: 2,
                    pt: 6,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.95), transparent)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    opacity: showControls || !isPlaying ? 1 : 0,
                    transition: 'opacity 0.4s ease',
                    zIndex: 10,
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
                            width: 14,
                            height: 14,
                            transition: 'transform 0.2s',
                            '&:hover': { transform: 'scale(1.25)' }
                        },
                    }}
                />

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

// ── Main Overlay Component ──────────────────────────────────────────────────

const THUMB_WIDTH = 56;
const THUMB_GAP = 12;
const VISIBLE_BUFFER = 2;

const useVideoThumbnails = (items: MediaItem[], currentIndex: number) => {
    const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

    useEffect(() => {
        let isMounted = true;
        const generateVisible = async () => {
            const start = Math.max(0, currentIndex - VISIBLE_BUFFER);
            const end = Math.min(items.length - 1, currentIndex + VISIBLE_BUFFER);
            
            for (let i = start; i <= end; i++) {
                if (!isMounted) break;
                const item = items[i];
                const hasThumbnail = item.thumbnail && item.thumbnail.length > 10;
                if (hasThumbnail || thumbnails[item.fileId]) continue;
                if (!isVideo(item.mimeType, item.fileName)) continue;
                if (!item.url) continue;

                try {
                    const filePath = item.url.replace(/\\/g, '/');
                    const result = await (window as any).upeer.generateVideoThumbnail(filePath);
                    if (isMounted && result.success) {
                        setThumbnails(prev => ({ ...prev, [item.fileId]: result.dataUrl }));
                    }
                } catch { /* ffmpeg not available */ }
            }
        };
        generateVisible();
        return () => { isMounted = false; };
    }, [items, currentIndex, thumbnails]);

    return thumbnails;
};

export const MediaViewerOverlay: React.FC<MediaViewerOverlayProps> = ({
    items,
    initialIndex,
    onClose,
    onDownload,
    onReply,
    onForward,
    onReact,
    onGoToMessage,
}) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [contentUrl, setContentUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const emojiMenuRef = useRef<HTMLDivElement>(null);
    const generatedThumbnails = useVideoThumbnails(items, currentIndex);

    const currentItem = items[currentIndex];
    const isMediaVideo = currentItem ? isVideo(currentItem.mimeType, currentItem.fileName) : false;

    // Handle index change
    useEffect(() => {
        if (!currentItem) return;

        setLoading(true);
        setError(null);

        const fileUrl = currentItem.url;
        let url = '';
        if (fileUrl.startsWith('data:') || fileUrl.startsWith('media://')) {
            url = fileUrl;
        } else if (fileUrl) {
            // BUG FIX: Asegurar que el path sea absoluto y esté normalizado para el protocolo media://
            // En Windows, los paths pueden venir con \ o /. El handler en appInitializer espera url.hostname + url.pathname.
            // En Linux, necesitamos que empiece por / tras el media:// para que appInitializer lo reciba correctamente.
            const normalizedPath = fileUrl.replace(/\\/g, '/');
            url = `media://${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`;
        }

        setContentUrl(url || null);
        setLoading(false);
    }, [currentIndex, currentItem]);

    const handleNext = React.useCallback(() => {
        if (currentIndex < items.length - 1) setCurrentIndex(currentIndex + 1);
    }, [currentIndex, items.length]);

    const handlePrev = React.useCallback(() => {
        if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
    }, [currentIndex]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === 'ArrowRight') handleNext();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleNext, handlePrev, onClose]);

    // Scroll carousel into view
    const carouselRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const activeThumb = carouselRef.current?.querySelector(`[data-index="${currentIndex}"]`);
        if (activeThumb) {
            activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    }, [currentIndex]);

    if (!currentItem) return null;

    return (
        <Sheet
            sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 2000,
                backgroundColor: 'rgba(0,0,0,0.95)',
                backdropFilter: 'blur(12px)',
                display: 'flex',
                flexDirection: 'column',
                animation: 'mediaFadeIn 0.25s ease-out',
                '@keyframes mediaFadeIn': {
                    from: { opacity: 0 },
                    to: { opacity: 1 }
                },
                userSelect: 'none'
            }}
            onClick={onClose}
        >
            {/* Main Content Area (Background) */}
            <Box
                sx={{
                    position: 'absolute',
                    top: 80,
                    left: 0,
                    right: 0,
                    bottom: 80,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1,
                    overflow: 'hidden',
                    p: 3,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Navigation Arrows */}
                {currentIndex > 0 && (
                    <IconButton
                        variant="plain"
                        color="neutral"
                        size="lg"
                        onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                        sx={{
                            position: 'absolute', left: 24, zIndex: 20,
                            borderRadius: 'md',
                            color: 'white',
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                        }}
                    >
                        <ChevronLeftIcon />
                    </IconButton>
                )}

                {currentIndex < items.length - 1 && (
                    <IconButton
                        variant="plain"
                        color="neutral"
                        size="lg"
                        onClick={(e) => { e.stopPropagation(); handleNext(); }}
                        sx={{
                            position: 'absolute', right: 24, zIndex: 20,
                            borderRadius: 'md',
                            color: 'white',
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                        }}
                    >
                        <ChevronRightIcon />
                    </IconButton>
                )}

                {loading && (
                    <CircularProgress color="primary" thickness={2} size="lg" />
                )}

                {error && (
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography level="body-md" sx={{ color: 'danger.300', mb: 1 }}>{error}</Typography>
                        {currentItem?.fileName?.toLowerCase().endsWith('.mkv') && (
                            <Typography level="body-xs" sx={{ color: 'rgba(255,255,255,0.7)', mb: 2, maxWidth: 300, mx: 'auto' }}>
                                Los archivos MKV pueden contener flujos no soportados por el navegador interno.
                            </Typography>
                        )}
                        <Stack direction="row" spacing={2} justifyContent="center">
                            <Sheet variant="outlined" color="neutral" sx={{ p: 1, px: 2, cursor: 'pointer', borderRadius: 'md', bgcolor: 'transparent', color: 'white' }} onClick={onClose}>
                                Cerrar
                            </Sheet>
                            {contentUrl && (
                                <Button
                                    variant="solid"
                                    color="primary"
                                    startDecorator={<OpenInNewIcon />}
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        // Extraer el path del protocolo media:// o usar el original
                                        const cleanPath = contentUrl.replace('media://', '');
                                        await window.upeer.openFile(cleanPath);
                                        onClose();
                                    }}
                                >
                                    Abrir en sistema
                                </Button>
                            )}
                        </Stack>
                    </Box>
                )}

                {!loading && !error && contentUrl && (
                    isMediaVideo ? (
                        <VideoPlayerWithControls
                            src={contentUrl}
                            fileName={currentItem.fileName}
                            onVideoError={() => setError('El formato de video o sus codecs no son compatibles con el reproductor interno.')}
                        />
                    ) : (
                        <img
                            key={currentIndex}
                            src={contentUrl}
                            alt={currentItem.fileName}
                            style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                objectFit: 'contain',
                                boxShadow: '0 0 80px rgba(0,0,0,0.6)',
                                animation: 'mediaContentScale 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                            }}
                            onError={() => setError('Error al cargar la imagen.')}
                        />
                    )
                )}
            </Box>

            {/* Header (Absolute Top) */}
            <Box
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)',
                    zIndex: 30,
                    pointerEvents: 'none'
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pointerEvents: 'auto' }}>
                    <Avatar
                        src={currentItem.senderAvatar}
                        size="sm"
                        sx={{ borderRadius: 'md', border: '1px solid rgba(255,255,255,0.2)' }}
                    >
                        {currentItem.senderName?.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography level="body-sm" sx={{ color: 'white', fontWeight: 'bold', lineHeight: 1.2 }}>
                            {currentItem.senderName || 'Desconocido'}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.2 }}>
                            {currentItem.timestamp ? `Hoy a las ${currentItem.timestamp}` : currentItem.fileName}
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 1, pointerEvents: 'auto' }} onClick={e => e.stopPropagation()}>
                    <Tooltip title="Responder" variant="soft" sx={{ zIndex: 3000 }}>
                        <IconButton
                            variant="plain"
                            color="neutral"
                            onClick={() => onReply?.(currentItem)}
                            sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
                        >
                            <ReplyIcon />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Reenviar" variant="soft" sx={{ zIndex: 3000 }}>
                        <IconButton
                            variant="plain"
                            color="neutral"
                            onClick={() => onForward?.(currentItem)}
                            sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
                        >
                            <ShortcutOutlinedIcon />
                        </IconButton>
                    </Tooltip>

                    <Box sx={{ position: 'relative' }}>
                        <Tooltip
                            title="Reaccionar"
                            variant="soft"
                            sx={{ zIndex: 3000 }}
                            open={emojiOpen ? false : undefined}
                        >
                            <IconButton
                                variant="plain"
                                color="neutral"
                                onClick={(e) => { e.stopPropagation(); setEmojiOpen(!emojiOpen); }}
                                sx={{
                                    color: 'white',
                                    '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                                }}
                            >
                                <AddReactionOutlinedIcon />
                            </IconButton>
                        </Tooltip>

                        {emojiOpen && (
                            <Box
                                ref={emojiMenuRef}
                                sx={{
                                    position: 'absolute',
                                    right: 0,
                                    top: '100%',
                                    mt: 1,
                                    display: 'flex',
                                    gap: 0.5,
                                    backgroundColor: 'background.surface',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 'lg',
                                    p: 0.75,
                                    boxShadow: 'lg',
                                    zIndex: 3100,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {QUICK_EMOJIS.map(emoji => (
                                    <Box
                                        key={emoji}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onReact?.(currentItem, emoji);
                                            setEmojiOpen(false);
                                            // Feedback: ir al mensaje automáticamente después de reaccionar
                                            setTimeout(() => onGoToMessage?.(currentItem), 100);
                                        }}
                                        sx={{
                                            width: 34, height: 34,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '20px',
                                            cursor: 'pointer',
                                            borderRadius: 'md',
                                            transition: 'background-color 0.1s ease, transform 0.1s ease',
                                            '&:hover': { backgroundColor: 'background.level1', transform: 'scale(1.15)' },
                                        }}
                                    >
                                        {emoji}
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Box>

                    <Tooltip title="Ir al mensaje" variant="soft" sx={{ zIndex: 3000 }}>
                        <IconButton
                            variant="plain"
                            color="neutral"
                            onClick={() => onGoToMessage?.(currentItem)}
                            sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
                        >
                            <OpenInNewIcon />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Descargar" variant="soft" sx={{ zIndex: 3000 }}>
                        <IconButton
                            variant="plain"
                            color="neutral"
                            onClick={() => onDownload(currentItem)}
                            sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
                        >
                            <DownloadOutlinedIcon />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Cerrar" variant="soft" sx={{ zIndex: 3000 }}>
                        <IconButton
                            variant="plain"
                            color="neutral"
                            onClick={onClose}
                            sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {/* Thumbnails Carousel (Absolute Bottom) - Fixed Window */}
            <Box
                sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 30
                }}
                onClick={e => e.stopPropagation()}
            >
                <Box sx={{ display: 'flex', gap: `${THUMB_GAP}px`, alignItems: 'center' }}>
                    {(() => {
                        const visibleCount = Math.min(VISIBLE_BUFFER * 2 + 1, items.length);
                        let startIdx = currentIndex - VISIBLE_BUFFER;
                        if (startIdx < 0) startIdx = 0;
                        if (startIdx + visibleCount > items.length) startIdx = items.length - visibleCount;
                        
                        return Array.from({ length: visibleCount }, (_, i) => {
                            const idx = startIdx + i;
                            const item = items[idx];
                            const thumb = item.thumbnail || generatedThumbnails[item.fileId];
                            const isImg = !isVideo(item.mimeType, item.fileName);
                            const showImg = (thumb && thumb.length > 10) || (isImg && item.url);
                            const isCurrent = idx === currentIndex;
                            
                            return (
                                <Box
                                    key={item.fileId}
                                    onClick={() => setCurrentIndex(idx)}
                                    sx={{
                                        width: THUMB_WIDTH,
                                        height: THUMB_WIDTH,
                                        flexShrink: 0,
                                        borderRadius: '8px',
                                        overflow: 'hidden',
                                        cursor: 'pointer',
                                        border: '2px solid',
                                        borderColor: isCurrent ? 'primary.400' : 'transparent',
                                        backgroundColor: 'neutral.800',
                                        transform: isCurrent ? 'scale(1.15)' : 'scale(1)',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        opacity: isCurrent ? 1 : 0.5,
                                        position: 'relative',
                                        '&:hover': { borderColor: isCurrent ? 'primary.400' : 'rgba(255,255,255,0.3)', opacity: 0.85 },
                                    }}
                                >
                                    {showImg ? (
                                        <img
                                            src={thumb || item.url}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    ) : (
                                        <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <PlayArrowIcon sx={{ fontSize: 24, color: 'neutral.400' }} />
                                        </Box>
                                    )}
                                    {isVideo(item.mimeType, item.fileName) && (
                                        <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'white', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 'sm', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <PlayArrowIcon sx={{ fontSize: 14 }} />
                                        </Box>
                                    )}
                                </Box>
                            );
                        });
                    })()}
                </Box>
            </Box>

            <style>{`
                body { overflow: hidden !important; }
                @keyframes mediaContentScale {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </Sheet>
    );
};
