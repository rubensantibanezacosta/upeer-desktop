import React from 'react';
import { Box, IconButton, Typography } from '@mui/joy';
import { Trash2, Circle } from 'lucide-react';
import { CHAT_COMPOSER_ICON_SIZE } from './composerLayout.js';
import { COMPOSER_ACTION_BUTTON_SX } from './composerActions.js';

interface RecordingBarProps {
    duration: number;
    onCancel: () => void;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

function formatDuration(sec: number) {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const RecordingBar: React.FC<RecordingBarProps> = ({ duration, onCancel, canvasRef }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0, pl: 1 }}>
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
        <IconButton
            aria-label="Descartar nota de voz"
            variant="plain"
            color="danger"
            onClick={onCancel}
            sx={COMPOSER_ACTION_BUTTON_SX}
        >
            <Trash2 size={CHAT_COMPOSER_ICON_SIZE} />
        </IconButton>
    </Box>
);
