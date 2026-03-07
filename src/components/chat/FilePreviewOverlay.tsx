import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    IconButton,
    Typography,
    Button,
    Stack,
    Sheet,
    CircularProgress,
    Tooltip,
    Input
} from '@mui/joy';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionIcon from '@mui/icons-material/Description';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

import AddIcon from '@mui/icons-material/Add';

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

// Hook para manejar las previsualizaciones de múltiples imágenes
const useFilesPreview = (files: FileInfo[]) => {
    const [previews, setPreviews] = useState<Record<string, { previewUrl: string, thumbnail: string }>>({});
    const [isGenerating, setIsGenerating] = useState(false);

    const generateThumbnail = (imageUrl: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve('');
                    return;
                }

                const maxSize = 200;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                const thumbnailData = canvas.toDataURL('image/jpeg', 0.7);
                resolve(thumbnailData);
            };
            img.onerror = () => resolve('');
            img.src = imageUrl;
        });
    };

    useEffect(() => {
        let isMounted = true;

        const loadPreviews = async () => {
            setIsGenerating(true);

            for (const file of files) {
                if (!isMounted) break;

                // We skip if we already loaded it, using functional update check implicitly below
                // However, we need to know if it's already generated. We can trust the initial array somewhat,
                // but let's just use the functional state trick.
                if (file.type.startsWith('image/')) {
                    try {
                        const result = await window.revelnest.readFileAsBase64(file.path, 50); // Max 50MB for preview
                        if (result.success && result.dataUrl && isMounted) {
                            const thumbnail = await generateThumbnail(result.dataUrl);
                            setPreviews(prev => {
                                if (prev[file.path]) return prev;
                                return {
                                    ...prev,
                                    [file.path]: {
                                        previewUrl: result.dataUrl!,
                                        thumbnail: thumbnail
                                    }
                                };
                            });
                        }
                    } catch (error) {
                        console.error('Error loading preview for', file.name, error);
                    }
                }
            }

            if (isMounted) {
                setIsGenerating(false);
            }
        };

        loadPreviews();

        return () => {
            isMounted = false;
        };
    }, [files]);

    return { previews, isGenerating };
};

export const FilePreviewOverlay: React.FC<FilePreviewOverlayProps> = ({
    files,
    onClose,
    onSend,
    onAddMore,
    onRemove,
    isDragging,
    onDragOver,
    onDragLeave,
    onDrop
}) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [captions, setCaptions] = useState<Record<number, string>>({});
    const { previews, isGenerating } = useFilesPreview(files);

    // Ajustar selectedIndex si se elimina un archivo
    useEffect(() => {
        if (selectedIndex >= files.length) {
            setSelectedIndex(Math.max(0, files.length - 1));
        }
    }, [files.length, selectedIndex]);

    const currentFile = files[selectedIndex];
    const currentPreview = currentFile ? previews[currentFile.path] : null;

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const getFileIcon = (fileType: string, size: number = 60) => {
        if (fileType.startsWith('image/')) return <ImageIcon sx={{ fontSize: size }} />;
        if (fileType.startsWith('audio/')) return <AudioFileIcon sx={{ fontSize: size }} />;
        if (fileType.startsWith('video/')) return <VideoFileIcon sx={{ fontSize: size }} />;
        if (fileType.includes('pdf')) return <DescriptionIcon sx={{ fontSize: size }} />;
        return <InsertDriveFileIcon sx={{ fontSize: size }} />;
    };

    const handleSendAll = () => {
        const thumbnails = files.map(f => previews[f.path]?.thumbnail);
        const caps = files.map((_, i) => captions[i] || '');
        onSend(files, thumbnails, caps);
    };

    if (!currentFile) {
        if (!isDragging) return null;
        return (
            <Sheet
                variant="solid"
                color="neutral"
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 1300,
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'rgba(var(--joy-palette-neutral-900Channel, 0 0 0) / 0.95)',
                    backdropFilter: 'blur(10px)',
                }}
            >
                <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-start' }}>
                    <IconButton variant="plain" color="neutral" onClick={onClose} sx={{ zIndex: 2000 }}>
                        <CloseIcon />
                    </IconButton>
                </Box>
                <Box sx={{ p: 4, display: 'flex', flexGrow: 1, pointerEvents: 'none' }}>
                    <Box sx={{
                        flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                        border: '2px dashed', borderColor: 'divider', borderRadius: 'xl',
                        backgroundColor: 'background.level1',
                        transition: 'all 0.2s ease-in-out'
                    }}>
                        <AddIcon sx={{ fontSize: 48, color: 'text.primary', mb: 2 }} />
                        <Typography level="h3" sx={{ color: 'text.primary', fontWeight: 500 }}>Suelta los archivos aquí</Typography>
                    </Box>
                </Box>
            </Sheet>
        );
    }

    return (
        <Sheet
            variant="solid"
            color="neutral"
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 1300,
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'rgba(var(--joy-palette-neutral-900Channel, 0 0 0) / 0.95)',
                backdropFilter: 'blur(10px)',
            }}
        >
            {isDragging && (
                <Box sx={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'background.backdrop',
                    backdropFilter: 'blur(6px)',
                    zIndex: 2000,
                    display: 'flex',
                    flexDirection: 'column',
                    p: 4,
                    pointerEvents: 'none'
                }}>
                    <Box sx={{
                        flexGrow: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        border: '2px dashed',
                        borderColor: 'divider',
                        borderRadius: 'xl',
                        backgroundColor: 'background.level1',
                        transition: 'all 0.2s ease-in-out'
                    }}>
                        <AddIcon sx={{ fontSize: 48, color: 'text.primary', mb: 2 }} />
                        <Typography level="h3" sx={{ color: 'text.primary', fontWeight: 500 }}>
                            Suelta para añadir archivos
                        </Typography>
                    </Box>
                </Box>
            )}

            {/* Header */}
            <Box sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
            }}>
                <IconButton
                    variant="plain"
                    color="neutral"
                    onClick={onClose}
                    sx={{ color: 'text.primary', '&:hover': { backgroundColor: 'background.level2' } }}
                >
                    <CloseIcon />
                </IconButton>
                <Box sx={{ flexGrow: 1, textAlign: 'center' }}>
                    <Typography level="body-sm" sx={{ color: 'text.primary', fontWeight: 'md' }}>
                        {currentFile.name}
                    </Typography>
                </Box>
                <Box sx={{ width: 40 }} /> {/* Spacer to center name */}
            </Box>

            {/* Preview Content */}
            <Box sx={{
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                p: 4,
                overflow: 'hidden',
                position: 'relative'
            }}>
                {currentPreview?.previewUrl ? (
                    <Box
                        component="img"
                        src={currentPreview.previewUrl}
                        sx={{
                            maxWidth: '90%',
                            maxHeight: '60vh',
                            objectFit: 'contain',
                            borderRadius: 'md',
                            boxShadow: 'lg',
                            transition: 'all 0.3s ease'
                        }}
                    />
                ) : (
                    <Box sx={{
                        p: 6,
                        borderRadius: 'lg',
                        backgroundColor: 'background.level1',
                        color: 'primary.main',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: 'sm',
                        width: 280,
                        height: 280
                    }}>
                        {getFileIcon(currentFile.type, 100)}
                        <Typography level="body-md" sx={{ mt: 2, color: 'text.secondary' }}>
                            No hay vista previa disponible
                        </Typography>
                        <Typography level="body-xs" sx={{ mt: 1, color: 'text.tertiary' }}>
                            {formatFileSize(currentFile.size)} - {currentFile.type.split('/')[1]?.toUpperCase() || 'FILE'}
                        </Typography>
                    </Box>
                )}
            </Box>

            {/* Footer / Carousel & Send Bar */}
            <Box sx={{
                p: 2,
                backgroundColor: 'background.surface',
                borderTop: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
                gap: 2
            }}>
                {/* Caption / Command area */}
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Box sx={{
                        width: '100%',
                        maxWidth: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5
                    }}>
                        <Input
                            size="lg"
                            variant="outlined"
                            color="neutral"
                            placeholder="Añade un comentario..."
                            value={captions[selectedIndex] || ''}
                            onChange={(e) => setCaptions(prev => ({ ...prev, [selectedIndex]: e.target.value }))}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter' && !isGenerating) {
                                    handleSendAll();
                                }
                            }}
                            sx={{ flexGrow: 1, borderRadius: 'lg' }}
                            disabled={isGenerating}
                        />
                        <IconButton
                            variant="plain"
                            color={isGenerating ? "neutral" : "primary"}
                            onClick={handleSendAll}
                            disabled={isGenerating}
                        >
                            <SendIcon />
                        </IconButton>
                    </Box>
                </Box>

                {/* Carousel & Action Bar */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, pb: 2 }}>
                    <Box sx={{
                        flexGrow: 1,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 1.5,
                        overflowX: 'auto',
                        py: 1,
                        '&::-webkit-scrollbar': { display: 'none' }
                    }}>
                        {files.map((file, index) => (
                            <Box
                                key={file.path}
                                onClick={() => setSelectedIndex(index)}
                                sx={{
                                    position: 'relative',
                                    width: 56,
                                    height: 56,
                                    borderRadius: '8px',
                                    border: '2px solid',
                                    borderColor: selectedIndex === index ? 'primary.main' : 'transparent',
                                    transition: 'all 0.2s',
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                    backgroundColor: 'background.level1',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    '&:hover': {
                                        borderColor: selectedIndex === index ? 'primary.main' : 'neutral.outlinedBorder',
                                        backgroundColor: 'background.level2'
                                    }
                                }}
                            >
                                {previews[file.path]?.thumbnail ? (
                                    <Box
                                        component="img"
                                        src={previews[file.path].thumbnail}
                                        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                ) : (
                                    getFileIcon(file.type, 24)
                                )}

                                {files.length > 1 && (
                                    <IconButton
                                        size="sm"
                                        variant="solid"
                                        color="danger"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemove(index);
                                        }}
                                        sx={{
                                            position: 'absolute',
                                            top: -8,
                                            right: -8,
                                            minWidth: 16,
                                            minHeight: 16,
                                            width: 16,
                                            height: 16,
                                            p: 0,
                                            borderRadius: '50%',
                                            opacity: 0,
                                            transform: 'scale(0.5)',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            zIndex: 1
                                        }}
                                        className="remove-btn"
                                    >
                                        <CloseIcon sx={{ fontSize: 10 }} />
                                    </IconButton>
                                )}
                                <style>{`
                                    div:hover > .remove-btn {
                                        opacity: 1;
                                        transform: scale(1);
                                        top: 2px;
                                        right: 2px;
                                    }
                                `}</style>
                            </Box>
                        ))}

                        {/* Add more button */}
                        <IconButton
                            variant="outlined"
                            color="neutral"
                            onClick={onAddMore}
                            sx={{
                                width: 56,
                                height: 56,
                                borderRadius: '8px',
                            }}
                        >
                            <AddIcon />
                        </IconButton>
                    </Box>
                </Box>
            </Box>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </Sheet>
    );
};
