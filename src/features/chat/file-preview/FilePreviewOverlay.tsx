import React, { useState, useEffect } from 'react';
import {
    Box, IconButton, Typography, Input, Sheet,
} from '@mui/joy';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import AddIcon from '@mui/icons-material/Add';
import { FilePreviewCarousel } from './FilePreviewCarousel.js';
import { DragDropPlaceholder } from './DragDropPlaceholder.js';
import { FilePreviewVideoPlayer } from './FilePreviewVideoPlayer.js';
import { FileInfo, getFileTypeIcon, useFilesPreview } from './filePreviewSupport.js';
import { ImageEditStage } from './ImageEditStage.js';
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
    const [editedUrls, setEditedUrls] = useState<Record<string, string>>({});
    const { previews, isGenerating, assetPaths } = useFilesPreview(files);

    useEffect(() => {
        if (selectedIndex >= files.length) setSelectedIndex(Math.max(0, files.length - 1));
    }, [files.length, selectedIndex]);

    const currentFile = files[selectedIndex];
    const currentPreview = currentFile ? previews[currentFile.path] : null;
    const displayedUrl = (currentFile && editedUrls[currentFile.path]) || currentPreview?.previewUrl || null;

    const handleEdited = (dataUrl: string) => {
        if (!currentFile) return;
        setEditedUrls((prev) => ({ ...prev, [currentFile.path]: dataUrl }));
    };

    const handleReset = () => {
        if (!currentFile) return;
        setEditedUrls((prev) => {
            const next = { ...prev };
            delete next[currentFile.path];
            return next;
        });
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
                        <ImageEditStage
                            currentFile={currentFile}
                            displayedUrl={displayedUrl}
                            canReset={!!editedUrls[currentFile.path]}
                            onEdited={handleEdited}
                            onReset={handleReset}
                        />
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
