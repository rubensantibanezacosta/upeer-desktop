import React from 'react';
import { Box, Typography, Button } from '@mui/joy';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

interface UnsupportedVideoFallbackProps {
    fileName: string;
    reason: string;
    thumbnailSrc?: string;
    actionLabel?: string;
    onAction?: () => void;
    compact?: boolean;
}

export const UnsupportedVideoFallback: React.FC<UnsupportedVideoFallbackProps> = ({
    fileName,
    reason,
    thumbnailSrc,
    actionLabel = 'Abrir en sistema',
    onAction,
    compact = false,
}) => (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: compact ? 2 : 3 }}>
        <Box sx={{ width: '100%', maxWidth: compact ? 420 : 520, borderRadius: 'xl', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid', borderColor: 'rgba(255,255,255,0.08)', boxShadow: 'lg' }}>
            <Box sx={{ position: 'relative', minHeight: compact ? 180 : 280, maxHeight: compact ? 280 : 420, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'black' }}>
                {thumbnailSrc ? (
                    <Box component="img" src={thumbnailSrc} alt={fileName} sx={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.82 }} />
                ) : (
                    <VideoFileIcon sx={{ fontSize: compact ? 72 : 96, color: 'rgba(255,255,255,0.45)' }} />
                )}
            </Box>
            <Box sx={{ p: compact ? 2 : 2.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <Typography level={compact ? 'title-sm' : 'title-md'} sx={{ color: 'white' }}>{fileName}</Typography>
                <Typography level="body-sm" sx={{ color: 'rgba(255,255,255,0.72)' }}>{reason}</Typography>
                {onAction ? (
                    <Box sx={{ pt: 0.5 }}>
                        <Button size={compact ? 'sm' : 'md'} variant="solid" color="primary" startDecorator={<OpenInNewIcon />} onClick={onAction}>
                            {actionLabel}
                        </Button>
                    </Box>
                ) : null}
            </Box>
        </Box>
    </Box>
);