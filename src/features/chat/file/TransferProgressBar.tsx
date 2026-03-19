import React from 'react';
import {
    Box,
    LinearProgress,
    Typography,
    IconButton,
    Stack,
    Chip,
    Tooltip,
    CircularProgress
} from '@mui/joy';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { FileTransfer } from '../../../hooks/useFileTransfer.js';


interface TransferProgressBarProps {
    transfer: FileTransfer;
    onCancel?: (fileId: string) => void;
    compact?: boolean;
}

export const TransferProgressBar: React.FC<TransferProgressBarProps> = ({
    transfer,
    onCancel,
    compact = false
}) => {
    const {
        fileId,
        fileName,
        fileSize = 0,
        progress = 0,
        state,
        direction,
        bytesTransferred = 0,
        totalBytes = fileSize,
        chunksTransferred = 0,
        totalChunks = 0
    } = transfer;

    const formatFileSize = (bytes?: number): string => {
        const num = bytes || 0;
        if (num === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(num) / Math.log(k));
        return parseFloat((num / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const getStatusColor = () => {
        switch (state) {
            case 'completed': return 'success';
            case 'failed': return 'danger';
            case 'cancelled': return 'neutral';
            case 'active': {
                const phase = (transfer as any).phase;
                if (phase === 3) return 'warning'; // Replicating
                if (phase === 4) return 'primary'; // Vaulted
                return 'primary';
            }
            case 'pending': return 'warning';
            default: return 'neutral';
        }
    };

    const getStatusIcon = () => {
        switch (state) {
            case 'completed':
                return <CheckCircleIcon sx={{ color: 'success.500', fontSize: '1.2rem' }} />;
            case 'failed':
                return <ErrorIcon sx={{ color: 'danger.500', fontSize: '1.2rem' }} />;
            case 'cancelled':
                return <CloseIcon sx={{ color: 'neutral.500', fontSize: '1.2rem' }} />;
            case 'active': {
                const phase = (transfer as any).phase;
                if (phase === 3) return <CloudUploadIcon sx={{ color: 'warning.500', fontSize: '1.2rem', animation: 'pulse 1s infinite' }} />;
                if (phase === 4) return <CloudUploadIcon sx={{ color: 'primary.500', fontSize: '1.2rem' }} />;
                return direction === 'sending'
                    ? <CloudUploadIcon sx={{ color: 'primary.500', fontSize: '1.2rem' }} />
                    : <CloudDownloadIcon sx={{ color: 'primary.500', fontSize: '1.2rem' }} />;
            }
            case 'pending':
                return <CircularProgress size="sm" thickness={3} />;
            default:
                return null;
        }
    };

    const getStatusText = () => {
        // Support for new social mesh phases (numeric values from TransferPhase enum)
        const phase = (transfer as any).phase;
        if (phase === 3) return 'Replicando en red social...'; // REPLICATING
        if (phase === 4) return 'Guardado (Vaulted)'; // VAULTED

        switch (state) {
            case 'completed': return 'Completado';
            case 'failed': return 'Falló';
            case 'cancelled': return 'Cancelado';
            case 'active':
                return direction === 'sending' ? 'Enviando...' : 'Recibiendo...';
            case 'pending': return 'Pendiente';
            default: return 'Desconocido';
        }
    };

    const handleCancel = () => {
        if (onCancel && (state === 'pending' || state === 'active')) {
            onCancel(fileId);
        }
    };

    if (compact) {
        return (
            <Box sx={{
                p: 1.5,
                borderRadius: 'md',
                backgroundColor: 'background.level1',
                border: '1px solid',
                borderColor: 'divider',
                '&:hover': {
                    backgroundColor: 'background.level2'
                }
            }}>
                <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 24 }}>
                        {getStatusIcon()}
                    </Box>

                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography level="body-sm" noWrap sx={{ fontWeight: 600 }}>
                            {fileName}
                        </Typography>

                        {state === 'active' && (
                            <Box sx={{ mt: 0.5 }}>
                                <LinearProgress
                                    value={progress}
                                    determinate
                                    size="sm"
                                    sx={{
                                        '& .MuiLinearProgress-bar': {
                                            transition: 'transform 0.5s ease-out'
                                        }
                                    }}
                                />
                                <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                                    <Typography level="body-xs">
                                        {formatFileSize(bytesTransferred)} / {formatFileSize(totalBytes)}
                                    </Typography>
                                    <Typography level="body-xs">
                                        {(progress || 0).toFixed(1)}%
                                    </Typography>
                                </Stack>
                            </Box>
                        )}

                        {state !== 'active' && (
                            <Typography level="body-xs" sx={{ opacity: 0.7 }}>
                                {getStatusText()} • {formatFileSize(fileSize)}
                            </Typography>
                        )}
                    </Box>

                    {onCancel && (state === 'pending' || state === 'active') && (
                        <IconButton
                            size="sm"
                            variant="plain"
                            color="neutral"
                            onClick={handleCancel}
                            sx={{ ml: 0.5 }}
                        >
                            <CloseIcon />
                        </IconButton>
                    )}
                </Stack>
            </Box>
        );
    }

    // Full version
    return (
        <Box sx={{
            p: 2,
            borderRadius: 'lg',
            backgroundColor: 'background.surface',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: 'sm'
        }}>
            <Stack spacing={1.5}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                        {getStatusIcon()}
                        <Typography level="title-sm" sx={{ fontWeight: 600 }}>
                            {fileName}
                        </Typography>
                        <Chip
                            variant="soft"
                            color={getStatusColor()}
                            size="sm"
                        >
                            {getStatusText()}
                        </Chip>
                        {direction === 'sending' ? (
                            <Chip variant="outlined" size="sm" color="primary">
                                Enviando
                            </Chip>
                        ) : (
                            <Chip variant="outlined" size="sm" color="success">
                                Recibiendo
                            </Chip>
                        )}
                    </Stack>

                    {onCancel && (state === 'pending' || state === 'active') && (
                        <Tooltip title="Cancelar transferencia">
                            <IconButton
                                size="sm"
                                variant="outlined"
                                color="danger"
                                onClick={handleCancel}
                            >
                                <CloseIcon />
                            </IconButton>
                        </Tooltip>
                    )}
                </Stack>

                <Typography level="body-sm" sx={{ opacity: 0.8 }}>
                    Tamaño: {formatFileSize(fileSize)} • Fragmentos: {chunksTransferred || 0}/{totalChunks || 0}
                </Typography>

                {state === 'active' && (
                    <>
                        <Box>
                            <LinearProgress
                                value={progress}
                                determinate
                                size="lg"
                                sx={{
                                    height: 8,
                                    borderRadius: 4,
                                    '& .MuiLinearProgress-bar': {
                                        borderRadius: 4,
                                        transition: 'transform 0.5s ease-out'
                                    }
                                }}
                            />
                            <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
                                <Typography level="body-sm">
                                    Progreso: {progress.toFixed(1)}%
                                </Typography>
                                <Typography level="body-sm">
                                    {formatFileSize(bytesTransferred)} / {formatFileSize(totalBytes)}
                                </Typography>
                            </Stack>
                        </Box>

                        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                            <Typography level="body-xs" sx={{ opacity: 0.7 }}>
                                Velocidad: calculando...
                            </Typography>
                            <Typography level="body-xs" sx={{ opacity: 0.7 }}>
                                Tiempo restante: calculando...
                            </Typography>
                        </Stack>
                    </>
                )}

                {(state === 'completed' || state === 'failed' || state === 'cancelled') && (
                    <Typography level="body-sm" sx={{
                        fontStyle: 'italic',
                        color: state === 'completed' ? 'success.600' :
                            state === 'failed' ? 'danger.600' : 'neutral.600'
                    }}>
                        {state === 'completed' && '✓ Transferencia completada exitosamente'}
                        {state === 'failed' && '✗ La transferencia falló'}
                        {state === 'cancelled' && '⨯ Transferencia cancelada'}
                    </Typography>
                )}
            </Stack>
        </Box>
    );
};