import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/joy';
import { Mic, MicOff, Video, VideoOff, PhoneOff, ScreenShare, ScreenShareOff } from 'lucide-react';

interface CallControlsProps {
    muted: boolean;
    cameraEnabled: boolean;
    showCamera?: boolean;
    screenSharing?: boolean;
    onToggleScreenShare?: () => void;
    onToggleMute: () => void;
    onToggleCamera: () => void;
    onEnd: () => void;
}

export const CallControls: React.FC<CallControlsProps> = ({ muted, cameraEnabled, showCamera = true, screenSharing = false, onToggleScreenShare, onToggleMute, onToggleCamera, onEnd }) => (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', justifyContent: 'center' }}>
        <Tooltip title={muted ? 'Activar micrófono' : 'Silenciar micrófono'} variant="soft">
            <IconButton aria-label="Silenciar micrófono" onClick={onToggleMute} color={muted ? 'danger' : 'neutral'} variant="soft" sx={{ width: 52, height: 52 }}>
                {muted ? <MicOff /> : <Mic />}
            </IconButton>
        </Tooltip>
        <Tooltip title="Colgar" variant="soft">
            <IconButton aria-label="Colgar llamada" onClick={onEnd} color="danger" variant="solid" sx={{ width: 60, height: 60 }}>
                <PhoneOff />
            </IconButton>
        </Tooltip>
        {showCamera && (
            <Tooltip title={cameraEnabled ? 'Apagar cámara' : 'Encender cámara'} variant="soft">
                <IconButton aria-label="Alternar cámara" onClick={onToggleCamera} color={cameraEnabled ? 'neutral' : 'danger'} variant="soft" sx={{ width: 52, height: 52 }}>
                    {cameraEnabled ? <Video /> : <VideoOff />}
                </IconButton>
            </Tooltip>
        )}
        {onToggleScreenShare && (
            <Tooltip title={screenSharing ? 'Detener pantalla' : 'Compartir pantalla'} variant="soft">
                <IconButton aria-label={screenSharing ? 'Detener compartir pantalla' : 'Compartir pantalla'} onClick={onToggleScreenShare} color={screenSharing ? 'warning' : 'neutral'} variant="soft" sx={{ width: 52, height: 52 }}>
                    {screenSharing ? <ScreenShareOff /> : <ScreenShare />}
                </IconButton>
            </Tooltip>
        )}
    </Box>
);
