import React from 'react';
import { Box, IconButton, Typography } from '@mui/joy';
import SendIcon from '@mui/icons-material/Send';
import DeleteIcon from '@mui/icons-material/Delete';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';

interface RecordingBarProps {
    duration: number;
    onCancel: () => void;
    onSend: () => void;
    disabled: boolean;
    isSending: boolean;
    canvasRef: React.RefObject<HTMLCanvasElement>;
}

function formatDuration(sec: number) {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const RecordingBar: React.FC<RecordingBarProps> = ({ duration, onCancel, onSend, disabled, isSending, canvasRef }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
        <IconButton variant="plain" color="danger" onClick={onCancel}>
            <DeleteIcon />
        </IconButton>
        <Box sx={{
            flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1.5,
            backgroundColor: 'background.level1', borderRadius: '8px',
            px: 2, height: '40px', overflow: 'hidden',
        }}>
            <FiberManualRecordIcon sx={{
                color: 'danger.500', fontSize: '10px', flexShrink: 0,
                '@keyframes recPulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
                animation: 'recPulse 1.5s infinite ease-in-out',
            }} />
            <Typography level="body-sm" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {formatDuration(duration)}
            </Typography>
            <canvas ref={canvasRef} style={{ flex: 1, minWidth: 0, height: '28px', display: 'block' }} />
        </Box>
        <IconButton variant="plain" color="neutral" onClick={onSend} disabled={disabled || isSending}>
            {isSending
                ? <Typography level="body-xs" sx={{ fontSize: '10px', fontVariantNumeric: 'tabular-nums' }}>…</Typography>
                : <SendIcon color="primary" />
            }
        </IconButton>
    </Box>
);
