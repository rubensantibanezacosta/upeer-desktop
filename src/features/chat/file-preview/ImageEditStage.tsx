import React, { useEffect, useRef, useState } from 'react';
import {
    Box, Button, Input, Typography,
} from '@mui/joy';
import type { FileInfo } from './filePreviewSupport.js';
import { ImageEditToolbar } from './ImageEditToolbar.js';
import {
    composeDrawingWithStrokes,
    composeStickersOnImage,
    composeTextOnImage,
    cropImageToDataUrl,
    DrawPoint,
    drawStrokesOnCanvas,
    DrawStroke,
    rotateImageToDataUrl,
    StickerItem,
    TextItem,
} from './imageEditSupport.js';

interface ImageEditStageProps {
    currentFile: FileInfo;
    displayedUrl: string;
    canReset: boolean;
    onEdited: (dataUrl: string) => void;
    onReset: () => void;
}

type EditMode = 'crop' | 'draw' | 'text' | 'sticker' | null;

export const ImageEditStage: React.FC<ImageEditStageProps> = ({ currentFile, displayedUrl, canReset, onEdited, onReset }) => {
    const [editMode, setEditMode] = useState<EditMode>(null);
    const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const [drawStrokes, setDrawStrokes] = useState<DrawStroke[]>([]);
    const [currentStroke, setCurrentStroke] = useState<DrawPoint[]>([]);
    const [drawColor, setDrawColor] = useState('#ff5252');
    const [textItems, setTextItems] = useState<TextItem[]>([]);
    const [textDraft, setTextDraft] = useState<TextItem | null>(null);
    const [stickerItems, setStickerItems] = useState<StickerItem[]>([]);
    const [stickerEmoji, setStickerEmoji] = useState('😀');
    const imgRef = useRef<HTMLImageElement | null>(null);
    const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const imgW = imgRef.current?.clientWidth || 0;
    const imgH = imgRef.current?.clientHeight || 0;

    const getRelativePoint = (e: React.MouseEvent): DrawPoint | null => {
        if (!imgRef.current) return null;
        const rect = imgRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        return {
            x: Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1),
            y: Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1),
        };
    };

    const enterMode = (mode: EditMode) => {
        setEditMode((prev) => (prev === mode ? null : mode));
        setCropRect(null);
        setDragStart(null);
        setDrawStrokes([]);
        setCurrentStroke([]);
        setTextItems([]);
        setTextDraft(null);
        setStickerItems([]);
    };

    const handleCropPointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (editMode !== 'crop' || !imgRef.current) return;
        const rect = imgRef.current.getBoundingClientRect();
        const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
        const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
        setDragStart({ x, y });
        setCropRect({ x, y, w: 0, h: 0 });
    };

    const handleCropPointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (editMode !== 'crop' || !imgRef.current || !dragStart) return;
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
        const dataUrl = cropImageToDataUrl(imgRef.current, cropRect);
        if (!dataUrl) return;
        onEdited(dataUrl);
        setEditMode(null);
        setCropRect(null);
        setDragStart(null);
    };

    const rotateImage = () => {
        if (!imgRef.current) return;
        const dataUrl = rotateImageToDataUrl(imgRef.current);
        if (!dataUrl) return;
        onEdited(dataUrl);
        setEditMode(null);
        setCropRect(null);
        setDragStart(null);
    };

    const handleDrawPointerDown = (e: React.MouseEvent): void => {
        if (editMode !== 'draw') return;
        e.preventDefault();
        const point = getRelativePoint(e);
        if (!point) return;
        setCurrentStroke([point]);
        setDragStart({ x: point.x, y: point.y });
    };

    const handleDrawPointerMove = (e: React.MouseEvent): void => {
        if (editMode !== 'draw' || !dragStart) return;
        const point = getRelativePoint(e);
        if (!point) return;
        setCurrentStroke((outline) => [...outline, point]);
    };

    const handleDrawPointerUp = () => {
        setCurrentStroke((outline) => {
            if (outline.length > 0) {
                setDrawStrokes((strokes) => [...strokes, outline]);
            }
            return [];
        });
        setDragStart(null);
    };

    const handleDrawPointerLeave = () => {
        if (editMode !== 'draw' || !dragStart) return;
        handleDrawPointerUp();
    };

    useEffect(() => {
        if (editMode === 'draw' && drawCanvasRef.current) {
            drawStrokesOnCanvas(drawCanvasRef.current, [...drawStrokes, ...(currentStroke.length > 0 ? [currentStroke] : [])], drawColor);
        }
    }, [editMode, drawStrokes, currentStroke, drawColor]);

    const cancelDrawMode = () => {
        setEditMode(null);
        setDrawStrokes([]);
        setCurrentStroke([]);
        setDragStart(null);
    };

    const applyDrawing = async () => {
        if (drawStrokes.length === 0) {
            cancelDrawMode();
            return;
        }
        const result = await composeDrawingWithStrokes(displayedUrl, drawStrokes, drawColor);
        if (result) onEdited(result);
        cancelDrawMode();
    };

    const handleImageClickForText = (e: React.MouseEvent<HTMLDivElement>) => {
        if (editMode !== 'text') return;
        const point = getRelativePoint(e);
        if (!point) return;
        setTextDraft({ text: '', x: point.x, y: point.y });
    };

    const handleImageClickForSticker = (e: React.MouseEvent<HTMLDivElement>) => {
        if (editMode !== 'sticker') return;
        const point = getRelativePoint(e);
        if (!point) return;
        setStickerItems((prev) => [...prev, { emoji: stickerEmoji, x: point.x, y: point.y }]);
    };

    const commitText = () => {
        if (!textDraft) return;
        const text = textDraft.text.trim();
        if (text) setTextItems((prev) => [...prev, { ...textDraft, text }]);
        setTextDraft(null);
    };

    const cancelTextMode = () => {
        setEditMode(null);
        setTextItems([]);
        setTextDraft(null);
        setDragStart(null);
    };

    const applyText = async () => {
        if (textItems.length === 0) {
            cancelTextMode();
            return;
        }
        const result = await composeTextOnImage(displayedUrl, textItems, drawColor);
        if (result) onEdited(result);
        cancelTextMode();
    };

    const cancelStickerMode = () => {
        setEditMode(null);
        setStickerItems([]);
        setDragStart(null);
    };

    const applyStickers = async () => {
        if (stickerItems.length === 0) {
            cancelStickerMode();
            return;
        }
        const result = await composeStickersOnImage(displayedUrl, stickerItems);
        if (result) onEdited(result);
        cancelStickerMode();
    };

    const activeEditsEmpty =
        (editMode === 'draw' && drawStrokes.length === 0) ||
        (editMode === 'text' && textItems.length === 0) ||
        (editMode === 'sticker' && stickerItems.length === 0);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, width: '100%' }}>
            <ImageEditToolbar
                editMode={editMode}
                drawColor={drawColor}
                stickerEmoji={stickerEmoji}
                canReset={canReset}
                onModeChange={enterMode}
                onColorChange={setDrawColor}
                onStickerEmojiChange={setStickerEmoji}
                onRotate={rotateImage}
                onReset={onReset}
            />

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
                        cursor: editMode ? 'crosshair' : 'default',
                    }}
                    onMouseDown={editMode === 'crop' ? handleCropPointerDown : editMode === 'text' ? handleImageClickForText : editMode === 'sticker' ? handleImageClickForSticker : undefined}
                    onMouseMove={handleCropPointerMove}
                    onMouseUp={handleCropPointerUp}
                    onMouseLeave={editMode === 'crop' ? handleCropPointerUp : undefined}
                />
                {editMode === 'crop' && cropRect && (
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
                {editMode === 'draw' && (
                    <canvas
                        ref={drawCanvasRef}
                        width={imgW}
                        height={imgH}
                        style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            width: `${imgW}px`,
                            height: `${imgH}px`,
                            cursor: 'crosshair',
                            touchAction: 'none',
                        }}
                        onMouseDown={handleDrawPointerDown}
                        onMouseMove={handleDrawPointerMove}
                        onMouseUp={handleDrawPointerUp}
                        onMouseLeave={handleDrawPointerLeave}
                        onMouseEnter={() => {
                            const canvas = drawCanvasRef.current;
                            if (canvas) {
                                const w = imgRef.current?.clientWidth || 0;
                                const h = imgRef.current?.clientHeight || 0;
                                canvas.width = w;
                                canvas.height = h;
                                canvas.style.width = `${w}px`;
                                canvas.style.height = `${h}px`;
                                drawStrokesOnCanvas(canvas, drawStrokes, drawColor);
                            }
                        }}
                    />
                )}
                {editMode === 'text' && textItems.map((item, index) => (
                    <Typography
                        key={index}
                        sx={{
                            position: 'absolute',
                            left: item.x * imgW,
                            top: item.y * imgH,
                            transform: 'translate(-50%, -50%)',
                            color: drawColor,
                            fontWeight: 800,
                            fontSize: 20,
                            textShadow: '0 0 4px #000',
                            userSelect: 'none',
                            pointerEvents: 'none',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {item.text}
                    </Typography>
                ))}
                {editMode === 'text' && textDraft && (
                    <Box sx={{ position: 'absolute', left: textDraft.x * imgW, top: textDraft.y * imgH, transform: 'translate(-50%, -50%)' }}>
                        <Input
                            autoFocus
                            size="sm"
                            variant="soft"
                            color="neutral"
                            value={textDraft.text}
                            placeholder="Texto"
                            onChange={(e) => setTextDraft({ ...textDraft, text: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') commitText();
                                if (e.key === 'Escape') setTextDraft(null);
                            }}
                            sx={{ minWidth: 160, backgroundColor: 'rgba(0,0,0,0.6)', '--Input-focusedHighlight': 'transparent' }}
                        />
                    </Box>
                )}
                {editMode === 'sticker' && stickerItems.map((item, index) => (
                    <Typography
                        key={index}
                        sx={{
                            position: 'absolute',
                            left: item.x * imgW,
                            top: item.y * imgH,
                            transform: 'translate(-50%, -50%)',
                            fontSize: 44,
                            userSelect: 'none',
                            pointerEvents: 'none',
                        }}
                    >
                        {item.emoji}
                    </Typography>
                ))}
                {(editMode === 'crop' || editMode === 'draw' || editMode === 'text' || editMode === 'sticker') && (
                    <Box sx={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 1 }}>
                        <Button
                            size="sm"
                            color="primary"
                            onClick={editMode === 'crop' ? applyCrop : editMode === 'draw' ? applyDrawing : editMode === 'text' ? applyText : applyStickers}
                            disabled={activeEditsEmpty}
                        >
                            Aplicar
                        </Button>
                        <Button
                            size="sm"
                            color="neutral"
                            variant="soft"
                            onClick={() => {
                                if (editMode === 'draw') cancelDrawMode();
                                else if (editMode === 'text') cancelTextMode();
                                else if (editMode === 'sticker') cancelStickerMode();
                                else {
                                    setEditMode(null);
                                    setCropRect(null);
                                    setDragStart(null);
                                }
                            }}
                        >
                            Cancelar
                        </Button>
                    </Box>
                )}
            </Box>
            <Typography level="body-xs" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                {currentFile.name} — {editMode === 'text' ? 'Haz clic en la imagen para colocar el texto' : editMode === 'draw' ? 'Dibuja sobre la imagen' : editMode === 'crop' ? 'Arrastra para seleccionar el recorte' : editMode === 'sticker' ? 'Haz clic en la imagen para pegar el sticker' : 'Usa la barra superior para editar'}
            </Typography>
        </Box>
    );
};