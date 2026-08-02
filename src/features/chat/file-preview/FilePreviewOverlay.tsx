import React, { useState, useEffect, useRef } from 'react';
import {
    Box, IconButton, Typography, Input, Sheet, Tooltip, Button,
} from '@mui/joy';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import AddIcon from '@mui/icons-material/Add';
import CropIcon from '@mui/icons-material/Crop';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import EditIcon from '@mui/icons-material/Edit';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import TuneIcon from '@mui/icons-material/Tune';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import AppsIcon from '@mui/icons-material/Apps';
import { FilePreviewCarousel } from './FilePreviewCarousel.js';
import { DragDropPlaceholder } from './DragDropPlaceholder.js';
import { FilePreviewVideoPlayer } from './FilePreviewVideoPlayer.js';
import { FileInfo, getFileTypeIcon, useFilesPreview } from './filePreviewSupport.js';
import { EmojiPicker } from '../input/EmojiPicker.js';
import { PdfPreview } from '../file/PdfPreview.js';
import { getMimeType, isPdfFile } from '../../../utils/fileUtils.js';

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

export const FilePreviewOverlay: React.FC<FilePreviewOverlayProps> = ({
    files, onClose, onSend, onAddMore, onRemove,
    isDragging, onDragOver, onDragLeave, onDrop,
}) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [captions, setCaptions] = useState<Record<number, string>>({});
    const [cropMode, setCropMode] = useState(false);
    const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const [editedUrls, setEditedUrls] = useState<Record<string, string>>({});
    const imgRef = useRef<HTMLImageElement | null>(null);
    const { previews, isGenerating, assetPaths } = useFilesPreview(files);

    useEffect(() => {
        if (selectedIndex >= files.length) setSelectedIndex(Math.max(0, files.length - 1));
    }, [files.length, selectedIndex]);

    const currentFile = files[selectedIndex];
    const currentPreview = currentFile ? previews[currentFile.path] : null;
    const displayedUrl = (currentFile && editedUrls[currentFile.path]) || currentPreview?.previewUrl || null;

    const handleCropPointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!cropMode || !imgRef.current) return;
        const rect = imgRef.current.getBoundingClientRect();
        const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
        const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
        setDragStart({ x, y });
        setCropRect({ x, y, w: 0, h: 0 });
    };

    const handleCropPointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!cropMode || !imgRef.current || !dragStart) return;
        const rect = imgRef.current.getBoundingClientRect();
        const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
        const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
        setCropRect({
            x: Math.min(dragStart.x, x),
            y: Math.min(dragStart.y, y),
            w: Math.abs(x - dragStart.x),
            h: Math.abs(y - dragStart.y),
        });
    };

    const handleCropPointerUp = () => setDragStart(null);

    const applyCrop = () => {
        if (!cropRect || !imgRef.current || cropRect.w < 4 || cropRect.h < 4) return;
        const img = imgRef.current;
        const scaleX = img.naturalWidth / img.clientWidth;
        const scaleY = img.naturalHeight / img.clientHeight;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(cropRect.w * scaleX));
        canvas.height = Math.max(1, Math.round(cropRect.h * scaleY));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(
            img,
            cropRect.x * scaleX,
            cropRect.y * scaleY,
            cropRect.w * scaleX,
            cropRect.h * scaleY,
            0,
            0,
            canvas.width,
            canvas.height,
        );
        setEditedUrls(prev => ({ ...prev, [currentFile.path]: canvas.toDataURL('image/png') }));
        setCropMode(false);
        setCropRect(null);
        setDragStart(null);
    };

    const handleSendAll = () => {
        const filesToSend = files.map(f => {
            const edited = editedUrls[f.path];
            const finalPath = assetPaths[f.path] || f.path;
            return edited ? { ...f, path: edited } : { ...f, path: finalPath };
        });
        const thumbnails = files.map(f => (f.path in editedUrls ? editedUrls[f.path] : (previews[f.path]?.thumbnail || undefined)));
        const caps = files.map((_, i) => captions[i] || '');
        onSend(filesToSend, thumbnails, caps);
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
            <Box sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)',
            }}>
                <IconButton aria-label="Cerrar adjuntos" variant="plain" color="neutral" onClick={onClose} sx={{ color: 'white', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
                    <CloseIcon />
                </IconButton>

                {/* Toolbar centrada - solo para imágenes */}
                {currentPreview?.previewUrl && (currentFile.type.startsWith('image/') || getMimeType(currentFile.name).startsWith('image/')) ? (
                    <Box sx={{ display: 'flex', gap: 1, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }} onClick={e => e.stopPropagation()}>
                        <Tooltip title="Recortar" variant="soft" sx={{ zIndex: 3000 }}>
                            <IconButton variant="plain" color="neutral" sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }} onClick={() => { setCropMode(prev => !prev); setCropRect(null); setDragStart(null); }}>
                                <CropIcon />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Cortar" variant="soft" sx={{ zIndex: 3000 }}>
                            <IconButton variant="plain" color="neutral" sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                                <ContentCutIcon />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Dibujar" variant="soft" sx={{ zIndex: 3000 }}>
                            <IconButton variant="plain" color="neutral" sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                                <EditIcon />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Texto" variant="soft" sx={{ zIndex: 3000 }}>
                            <IconButton variant="plain" color="neutral" sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                                <TextFieldsIcon />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Ajustes" variant="soft" sx={{ zIndex: 3000 }}>
                            <IconButton variant="plain" color="neutral" sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                                <TuneIcon />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Stickers" variant="soft" sx={{ zIndex: 3000 }}>
                            <IconButton variant="plain" color="neutral" sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                                <StickyNote2OutlinedIcon />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Más" variant="soft" sx={{ zIndex: 3000 }}>
                            <IconButton variant="plain" color="neutral" sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                                <AppsIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>
                ) : null}

                <Typography level="body-sm" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 'md', ml: 'auto' }}>
                    {currentFile.name}
                </Typography>
            </Box>

            {/* Preview area */}
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 4, overflow: 'hidden' }}>
                {currentPreview?.previewUrl ? (
                    isPdfFile(currentFile.type, currentFile.name) ? (
                        <PdfPreview src={currentPreview.previewUrl} name={currentFile.name} height="min(70vh, 960px)" />
                    ) : (currentFile.type.startsWith('video/') || getMimeType(currentFile.name).startsWith('video/')) ? (
                        <FilePreviewVideoPlayer src={currentPreview.previewUrl} name={currentFile.name} />
                    ) : displayedUrl ? (
                        <Box sx={{ position: 'relative', display: 'inline-block' }}>
                            <Box
                                component="img"
                                ref={imgRef}
                                src={displayedUrl}
                                draggable={false}
                                sx={{
                                    maxWidth: '90%',
                                    maxHeight: '60vh',
                                    objectFit: 'contain',
                                    borderRadius: 'md',
                                    boxShadow: 'lg',
                                    transition: 'all 0.3s ease',
                                    cursor: cropMode ? 'crosshair' : 'default',
                                }}
                                onMouseDown={handleCropPointerDown}
                                onMouseMove={handleCropPointerMove}
                                onMouseUp={handleCropPointerUp}
                                onMouseLeave={handleCropPointerUp}
                            />
                            {cropMode && cropRect && (
                                <Box sx={{
                                    position: 'absolute',
                                    left: cropRect.x,
                                    top: cropRect.y,
                                    width: cropRect.w,
                                    height: cropRect.h,
                                    border: '2px solid #fff',
                                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                                    pointerEvents: 'none',
                                }} />
                            )}
                            {cropMode && (
                                <Box sx={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 1 }}>
                                    <Button size="sm" color="primary" onClick={applyCrop}>Aplicar</Button>
                                    <Button size="sm" color="neutral" variant="soft" onClick={() => { setCropMode(false); setCropRect(null); setDragStart(null); }}>Cancelar</Button>
                                </Box>
                            )}
                        </Box>
                    ) : (
                        <Box sx={{ p: 6, borderRadius: 'lg', backgroundColor: 'background.level1', color: 'primary.main', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: 'sm', width: 280, height: 280 }}>
                            {getFileTypeIcon(currentFile.type, currentFile.name, 100)}
                            <Typography level="body-md" sx={{ mt: 2, color: 'text.secondary' }}>No hay vista previa disponible</Typography>
                            <Typography level="body-xs" sx={{ mt: 1, color: 'text.tertiary' }}>
                                {(currentFile.type === 'application/octet-stream' ? getMimeType(currentFile.name) : currentFile.type).split('/')[1]?.toUpperCase() || 'FILE'}
                            </Typography>
                        </Box>
                    )
                ) : (
                    <Box sx={{ p: 6, borderRadius: 'lg', backgroundColor: 'background.level1', color: 'primary.main', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: 'sm', width: 280, height: 280 }}>
                        {getFileTypeIcon(currentFile.type, currentFile.name, 100)}
                        <Typography level="body-md" sx={{ mt: 2, color: 'text.secondary' }}>No hay vista previa disponible</Typography>
                        <Typography level="body-xs" sx={{ mt: 1, color: 'text.tertiary' }}>
                            {(currentFile.type === 'application/octet-stream' ? getMimeType(currentFile.name) : currentFile.type).split('/')[1]?.toUpperCase() || 'FILE'}
                        </Typography>
                    </Box>
                )}
            </Box>

            {/* Footer */}
            <Box sx={{ p: 2, backgroundColor: 'background.surface', borderTop: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Caption + Send */}
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Box sx={{ width: '100%', maxWidth: 600, display: 'flex', alignItems: 'center', gap: 1.5, position: 'relative' }}>
                        <EmojiPicker
                            onSelect={(emoji) => setCaptions(prev => ({ ...prev, [selectedIndex]: (prev[selectedIndex] || '') + emoji }))}
                            disabled={isGenerating}
                        />
                        <Input
                            size="lg" variant="outlined" color="neutral"
                            placeholder="Añade un comentario..."
                            value={captions[selectedIndex] || ''}
                            onChange={(e) => setCaptions(prev => ({ ...prev, [selectedIndex]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isGenerating) handleSendAll(); }}
                            sx={{ flexGrow: 1, borderRadius: 'lg' }}
                            disabled={isGenerating}
                        />
                        <IconButton aria-label="Enviar adjuntos" variant="plain" color={isGenerating ? 'neutral' : 'primary'} onClick={handleSendAll} disabled={isGenerating}>
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
