import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, DialogContent, DialogTitle, IconButton, Modal, ModalDialog, Typography } from '@mui/joy';
import { Camera, RefreshCw, X } from 'lucide-react';

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.9;

interface CameraCaptureModalProps {
    open: boolean;
    onClose: () => void;
    onCapture: (dataUrl: string) => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({ open, onClose, onCapture }) => {
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
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } } });
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
        onCapture(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
        onClose();
    };

    const toggleFacing = () => setFacing((current) => (current === 'environment' ? 'user' : 'environment'));

    return (
        <Modal open={open} onClose={onClose}>
            <ModalDialog size="lg" sx={{ minWidth: 560, p: 0, overflow: 'hidden', backgroundColor: 'background.body' }}>
                <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <DialogTitle sx={{ fontSize: 16 }}>Hacer una foto</DialogTitle>
                    <IconButton size="sm" variant="plain" color="neutral" aria-label="Cerrar cámara" onClick={onClose}>
                        <X style={{ fontSize: 18 }} />
                    </IconButton>
                </Box>
                <DialogContent sx={{ p: 0, gap: 0 }}>
                    <Box sx={{ position: 'relative', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 380 }}>
                        <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </Box>
                    {error && (
                        <Alert color="danger" size="sm" sx={{ borderRadius: 0 }}>
                            <Typography level="body-xs">{error}</Typography>
                        </Alert>
                    )}
                    <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                        <Button size="sm" variant="plain" color="neutral" startDecorator={<RefreshCw size={16} />} onClick={toggleFacing}>
                            Girar
                        </Button>
                        <Button size="md" variant="solid" color="primary" startDecorator={<Camera size={18} />} disabled={!ready} onClick={capture}>
                            Capturar
                        </Button>
                    </Box>
                </DialogContent>
            </ModalDialog>
        </Modal>
    );
};
