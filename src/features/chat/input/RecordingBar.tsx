import React from 'react';
import { Box, IconButton, Typography } from '@mui/joy';
import { Send, Trash2, Circle } from 'lucide-react';
import { INPUT_PILL_RADIUS, INPUT_PILL_HEIGHT } from '../../../inputShape.js';

interface RecordingBarProps {
    duration: number;
    onCancel: () => void;
    onSend: () => void;
    disabled: boolean;
    isSending: boolean;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

function formatDuration(sec: number) {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const RecordingBar: React.FC<RecordingBarProps> = ({ duration, onCancel, onSend, disabled, isSending, canvasRef }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
        <IconButton variant="plain" color="danger" onClick={onCancel}>
            <Trash2 />
        </IconButton>
        <Box sx={{
            flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1.5,
            backgroundColor: 'background.level1', borderRadius: INPUT_PILL_RADIUS,
            px: 2, height: INPUT_PILL_HEIGHT, overflow: 'hidden',
        }}>
            <Box
                component="span"
                sx={{
                    display: 'grid', placeItems: 'center', color: 'danger.500', flexShrink: 0,
                    '@keyframes recPulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
                    animation: 'recPulse 1.5s infinite ease-in-out',
                }}
            >
                <Circle fill="currentColor" style={{ fontSize: 10 }} />
            </Box>
            <Typography level="body-sm" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {formatDuration(duration)}
            </Typography>
            <canvas ref={canvasRef} style={{ flex: 1, minWidth: 0, height: '28px', display: 'block' }} />
        </Box>
        <IconButton variant="plain" color="neutral" onClick={onSend} disabled={disabled || isSending}>
            {isSending
                ? <Typography level="body-xs" sx={{ fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}>…</Typography>
                : <Send style={{ color: 'var(--joy-palette-primary-main)' }} />
            }
        </IconButton>
    </Box>
);
