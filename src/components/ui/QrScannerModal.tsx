import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, ModalDialog, DialogTitle, DialogContent, Box, Button, Typography, Alert, IconButton, Divider } from '@mui/joy';
import { X, ScanLine, Info } from 'lucide-react';
import jsQR from 'jsqr';

const SCAN_INTERVAL_MS = 180;
const CANVAS_SIZE = 320;

interface QrScannerModalProps {
    open: boolean;
    onClose: () => void;
    onDetected: (value: string) => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({ open, onClose, onDetected }) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const onDetectedRef = useRef(onDetected);
    const [error, setError] = useState('');

    useEffect(() => {
        onDetectedRef.current = onDetected;
    }, [onDetected]);

    const stop = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
    }, []);

    useEffect(() => {
        if (!open) return;

        let cancelled = false;
        setError('');

        const start = async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                setError('Este equipo no expone ninguna cámara a la aplicación.');
                return;
            }
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => undefined);
                }
            } catch (cause) {
                if (cancelled) return;
                setError(cause instanceof Error && cause.name === 'NotAllowedError'
                    ? 'No hay permiso para usar la cámara.'
                    : 'No se pudo abrir la cámara de este equipo.');
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = CANVAS_SIZE;
            canvas.height = CANVAS_SIZE;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) {
                setError('No se pudo preparar el lienzo para leer el código.');
                return;
            }

            timerRef.current = setInterval(() => {
                const video = videoRef.current;
                if (!video || video.readyState < video.HAVE_CURRENT_DATA) return;
                context.drawImage(video, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
                const frame = context.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
                const result = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });
                if (result?.data) {
                    stop();
                    onDetectedRef.current(result.data.trim());
                }
            }, SCAN_INTERVAL_MS);
        };

        void start();
        return () => {
            cancelled = true;
            stop();
        };
    }, [open, stop]);

    const close = () => {
        stop();
        onClose();
    };

    return (
        <Modal open={open} onClose={close}>
            <ModalDialog sx={{ width: 420, maxWidth: '95vw', borderRadius: 'xl', p: 0, overflow: 'hidden' }}>
                <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'background.surface' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ScanLine style={{ fontSize: 20, color: 'var(--joy-palette-primary-400)' }} />
                        <DialogTitle sx={{ m: 0 }}>Escanear código QR</DialogTitle>
                    </Box>
                    <IconButton aria-label="Cerrar escáner" variant="plain" color="neutral" size="sm" onClick={close}>
                        <X style={{ fontSize: 20 }} />
                    </IconButton>
                </Box>
                <Divider />
                <DialogContent sx={{ p: 2.5 }}>
                    <Typography level="body-sm" sx={{ mb: 2 }}>
                        Apunta al código QR que muestra el móvil en Perfil → Mostrar QR.
                    </Typography>
                    {error ? (
                        <Alert variant="soft" color="danger" startDecorator={<Info style={{ fontSize: 16 }} />} sx={{ py: 1 }}>
                            {error}
                        </Alert>
                    ) : (
                        <Box sx={{ borderRadius: 'md', overflow: 'hidden', backgroundColor: 'black', aspectRatio: '1 / 1' }}>
                            <video
                                ref={videoRef}
                                autoPlay
                                muted
                                playsInline
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        </Box>
                    )}
                    <Typography level="body-xs" color="neutral" sx={{ mt: 1.5 }}>
                        Si la cámara no está disponible, cierra esta ventana y pega la identidad a mano.
                    </Typography>
                    <Button variant="plain" color="neutral" onClick={close} fullWidth sx={{ mt: 1.5 }}>
                        Cancelar
                    </Button>
                </DialogContent>
            </ModalDialog>
        </Modal>
    );
};
