import React, { useEffect, useState, useRef } from 'react';
import { toMediaUrl, fromMediaUrl } from '../../../utils/fileUtils.js';
import { Box, IconButton, Sheet, Typography, CircularProgress, Stack, Button } from '@mui/joy';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { UnsupportedVideoFallback } from '../../../components/ui/UnsupportedVideoFallback.js';
import { PdfPreview } from '../file/PdfPreview.js';
import { getInlineVideoUnsupportedReason, supportsInlineVideoPlayback } from '../../../utils/videoPlayback.js';
import { isPdfFile } from '../../../utils/fileUtils.js';
import { MediaViewerHeader } from './MediaViewerHeader.js';
import { MediaViewerThumbnails } from './MediaViewerThumbnails.js';
import { MediaViewerVideoPlayer } from './MediaViewerVideoPlayer.js';
import { isVideo, type MediaViewerOverlayProps, useVideoThumbnails } from './mediaViewerSupport.js';

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
    const isCurrentPdf = currentItem ? isPdfFile(currentItem.mimeType, currentItem.fileName) : false;
    const canPlayInlineCurrentVideo = currentItem ? supportsInlineVideoPlayback(currentItem.mimeType, currentItem.fileName) : false;
    const unsupportedCurrentVideoReason = currentItem ? getInlineVideoUnsupportedReason(currentItem.mimeType, currentItem.fileName) : null;

    // Handle index change
    useEffect(() => {
        if (!currentItem) return;

        setLoading(true);
        setError(null);

        const fileUrl = currentItem.url;
        let url = '';
        if (fileUrl.startsWith('data:')) {
            url = fileUrl;
        } else if (fileUrl) {
            url = toMediaUrl(fileUrl);
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
                                        const cleanPath = fromMediaUrl(contentUrl);
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
                    isCurrentPdf ? (
                        <PdfPreview
                            src={contentUrl}
                            name={currentItem.fileName}
                            height="100%"
                            onOpenExternal={async () => {
                                const cleanPath = fromMediaUrl(contentUrl);
                                await window.upeer.openFile(cleanPath);
                                onClose();
                            }}
                        />
                    ) : isMediaVideo ? (
                        canPlayInlineCurrentVideo ? (
                            <MediaViewerVideoPlayer
                                src={contentUrl}
                                fileName={currentItem.fileName}
                                onVideoError={() => setError('El formato de video o sus codecs no son compatibles con el reproductor interno.')}
                            />
                        ) : (
                            <UnsupportedVideoFallback
                                fileName={currentItem.fileName}
                                reason={unsupportedCurrentVideoReason || 'Este vídeo no se puede reproducir en el visor integrado.'}
                                thumbnailSrc={currentItem.thumbnail || generatedThumbnails[currentItem.fileId]}
                                onAction={async () => {
                                    const cleanPath = fromMediaUrl(contentUrl);
                                    await window.upeer.openFile(cleanPath);
                                    onClose();
                                }}
                            />
                        )
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

            <MediaViewerHeader currentItem={currentItem} emojiOpen={emojiOpen} setEmojiOpen={setEmojiOpen} emojiMenuRef={emojiMenuRef} onClose={onClose} onDownload={onDownload} onReply={onReply} onForward={onForward} onReact={onReact} onGoToMessage={onGoToMessage} />
            <MediaViewerThumbnails items={items} currentIndex={currentIndex} generatedThumbnails={generatedThumbnails} onSelect={setCurrentIndex} />

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
