import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/joy';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import CallEndIcon from '@mui/icons-material/CallEnd';

interface CallControlsProps {
    muted: boolean;
    cameraEnabled: boolean;
    onToggleMute: () => void;
    onToggleCamera: () => void;
    onEnd: () => void;
}

export const CallControls: React.FC<CallControlsProps> = ({ muted, cameraEnabled, onToggleMute, onToggleCamera, onEnd }) => (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', justifyContent: 'center' }}>
        <Tooltip title={muted ? 'Activar micrófono' : 'Silenciar micrófono'} variant="soft">
            <IconButton aria-label="Silenciar micrófono" onClick={onToggleMute} color={muted ? 'danger' : 'neutral'} variant="soft" sx={{ width: 52, height: 52 }}>
                {muted ? <MicOffIcon /> : <MicIcon />}
            </IconButton>
        </Tooltip>
        <Tooltip title="Colgar" variant="soft">
            <IconButton aria-label="Colgar llamada" onClick={onEnd} color="danger" variant="solid" sx={{ width: 60, height: 60 }}>
                <CallEndIcon />
            </IconButton>
        </Tooltip>
        <Tooltip title={cameraEnabled ? 'Apagar cámara' : 'Encender cámara'} variant="soft">
            <IconButton aria-label="Alternar cámara" onClick={onToggleCamera} color={cameraEnabled ? 'neutral' : 'danger'} variant="soft" sx={{ width: 52, height: 52 }}>
                {cameraEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
        </Tooltip>
    </Box>
);
