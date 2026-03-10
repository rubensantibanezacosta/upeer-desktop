import React, { useState, useEffect } from 'react';
import {
    Box, IconButton, Typography, Input, Sheet,
} from '@mui/joy';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import ImageIcon from '@mui/icons-material/Image';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import DescriptionIcon from '@mui/icons-material/Description';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import AddIcon from '@mui/icons-material/Add';
import { FilePreviewCarousel } from './FilePreviewCarousel.js';
import { DragDropPlaceholder } from './DragDropPlaceholder.js';
import { formatFileSize } from '../../../utils/fileUtils.js';

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
                const maxSize = 200;
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

    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            setIsGenerating(true);
            for (const file of files) {
                if (!isMounted) break;
                if (!file.type.startsWith('image/')) continue;
                try {
                    const result = await window.upeer.readFileAsBase64(file.path, 50);
                    if (result.success && result.dataUrl && isMounted) {
                        const thumbnail = await generateThumbnail(result.dataUrl);
                        setPreviews(prev => prev[file.path] ? prev : { ...prev, [file.path]: { previewUrl: result.dataUrl!, thumbnail } });
                    }
                } catch (e) { console.error('Error loading preview for', file.name, e); }
            }
            if (isMounted) setIsGenerating(false);
        };
        load();
        return () => { isMounted = false; };
    }, [files]);

    return { previews, isGenerating };
};

// ── File icon helper ──────────────────────────────────────────────────────────

const getFileTypeIcon = (fileType: string, size = 60) => {
    if (fileType.startsWith('image/')) return <ImageIcon sx={{ fontSize: size }} />;
    if (fileType.startsWith('audio/')) return <AudioFileIcon sx={{ fontSize: size }} />;
    if (fileType.startsWith('video/')) return <VideoFileIcon sx={{ fontSize: size }} />;
    if (fileType.includes('pdf')) return <DescriptionIcon sx={{ fontSize: size }} />;
    return <InsertDriveFileIcon sx={{ fontSize: size }} />;
};

// ── Component ─────────────────────────────────────────────────────────────────

export const FilePreviewOverlay: React.FC<FilePreviewOverlayProps> = ({
    files, onClose, onSend, onAddMore, onRemove,
    isDragging, onDragOver, onDragLeave, onDrop,
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
                    <Box component="img" src={currentPreview.previewUrl} sx={{ maxWidth: '90%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 'md', boxShadow: 'lg', transition: 'all 0.3s ease' }} />
                ) : (
                    <Box sx={{ p: 6, borderRadius: 'lg', backgroundColor: 'background.level1', color: 'primary.main', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: 'sm', width: 280, height: 280 }}>
                        {getFileTypeIcon(currentFile.type, 100)}
                        <Typography level="body-md" sx={{ mt: 2, color: 'text.secondary' }}>No hay vista previa disponible</Typography>
                        <Typography level="body-xs" sx={{ mt: 1, color: 'text.tertiary' }}>
                            {formatFileSize(currentFile.size)} - {currentFile.type.split('/')[1]?.toUpperCase() || 'FILE'}
                        </Typography>
                    </Box>
                )}
            </Box>

            {/* Footer */}
            <Box sx={{ p: 2, backgroundColor: 'background.surface', borderTop: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 2 }}>
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
