import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Alert, Box, IconButton, Sheet, Typography } from '@mui/joy';
import { Camera, Check, Film, RefreshCw, X } from 'lucide-react';

import { ATTACHMENT_SHEET_SX, CAMERA_SHEET_Z_INDEX, SHEET_FOOTER_SX, SHEET_HEADER_SX } from './overlayStyle.js';

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.9;
const SHUTTER_SIZE = 64;
const THUMB_SIZE = 52;

interface CameraCaptureOverlayProps {
    open: boolean;
    shots: string[];
    onCapture: (dataUrl: string) => void;
    onClose: () => void;
}

export const CameraCaptureOverlay: React.FC<CameraCaptureOverlayProps> = ({ open, shots, onCapture, onClose }) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);
    const [facing, setFacing] = useState<'user' | 'environment'>('environment');

    const stop = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
    }, []);

    useEffect(() => {
        if (!open) {
            stop();
            setReady(false);
            setError('');
            return;
        }
        let cancelled = false;
        setReady(false);
        setError('');

        const start = async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                setError('Este equipo no expone ninguna cámara a la aplicación.');
                return;
            }
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
                });
                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                stop();
                streamRef.current = stream;
                const video = videoRef.current;
                if (video) {
                    video.srcObject = stream;
                    const playing = video.play();
                    if (playing) {
                        void playing.catch((cause) => console.warn('No se pudo reproducir el vídeo de la cámara.', cause));
                    }
                }
                setReady(true);
            } catch (cause) {
                if (cancelled) return;
                setError(cause instanceof Error && cause.name === 'NotAllowedError'
                    ? 'No hay permiso para usar la cámara.'
                    : 'No se pudo abrir la cámara de este equipo.');
            }
        };

        void start();
        return () => {
            cancelled = true;
            stop();
        };
    }, [facing, open, stop]);

    if (!open) return null;

    const capture = () => {
        const video = videoRef.current;
        if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
            setError('La cámara todavía no tiene imagen.');
            return;
        }
        const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const context = canvas.getContext('2d');
        if (!context) {
            setError('No se pudo componer la foto capturada.');
            return;
        }
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        setError('');
        onCapture(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };

    return createPortal(
        <Sheet variant="solid" color="neutral" sx={{ ...ATTACHMENT_SHEET_SX, position: 'fixed', zIndex: CAMERA_SHEET_Z_INDEX }}>
            <Box sx={SHEET_HEADER_SX}>
                <IconButton aria-label="Cerrar cámara" variant="plain" color="neutral" onClick={onClose} sx={{ color: 'white', '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' } }}>
                    <X />
                </IconButton>
                <Typography level="body-sm" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 'md', ml: 'auto' }}>
                    {shots.length > 0 ? `${shots.length} ${shots.length === 1 ? 'foto' : 'fotos'}` : 'Cámara'}
                </Typography>
            </Box>

            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 4, overflow: 'hidden', minHeight: 0 }}>
                <Box
                    component="video"
                    ref={videoRef}
                    muted
                    playsInline
                    autoPlay
                    sx={{
                        maxWidth: '90%',
                        maxHeight: '60vh',
                        objectFit: 'contain',
                        backgroundColor: '#000',
                        borderRadius: 'lg',
                        boxShadow: 'lg',
                        display: 'block',
                    }}
                />
            </Box>

            {error && (
                <Alert color="danger" variant="soft" sx={{ mx: 2, mb: 1, borderRadius: 'md' }}>
                    <Typography level="body-xs">{error}</Typography>
                </Alert>
            )}

            <Box sx={SHEET_FOOTER_SX}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                    <IconButton aria-label="Girar cámara" variant="plain" color="neutral" onClick={() => setFacing((current) => (current === 'environment' ? 'user' : 'environment'))} sx={{ width: SHUTTER_SIZE }}>
                        <RefreshCw />
                    </IconButton>

                    <IconButton
                        aria-label="Capturar foto"
                        variant="solid"
                        color="primary"
                        onClick={capture}
                        disabled={!ready}
                        sx={{ width: SHUTTER_SIZE, height: SHUTTER_SIZE, borderRadius: '50%', border: '3px solid', borderColor: 'divider' }}
                    >
                        <Camera />
                    </IconButton>

                    <IconButton aria-label="Terminar de hacer fotos" variant="plain" color={shots.length > 0 ? 'success' : 'neutral'} onClick={onClose} disabled={shots.length === 0} sx={{ width: SHUTTER_SIZE }}>
                        <Check />
                    </IconButton>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, minHeight: THUMB_SIZE }}>
                    {shots.length === 0 ? (
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            <Film style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }} />
                            Puedes hacer varias fotos seguidas
                        </Typography>
                    ) : (
                        shots.map((shot, index) => (
                            <Box
                                key={`${index}-${shot.length}`}
                                component="img"
                                src={shot}
                                alt={`Foto ${index + 1}`}
                                sx={{ width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 'sm', objectFit: 'cover', border: '1px solid', borderColor: 'divider' }}
                            />
                        ))
                    )}
                </Box>
            </Box>
        </Sheet>,
        document.body,
    );
};
