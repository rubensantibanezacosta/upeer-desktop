import React from 'react';
import {
    Box,
    Typography,
    IconButton,
    Avatar,
    Button,
    Tooltip
} from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import LocalPhoneIcon from '@mui/icons-material/LocalPhone';
import VideocamIcon from '@mui/icons-material/Videocam';
import CheckIcon from '@mui/icons-material/Check';
import MoreVertIcon from '@mui/icons-material/MoreVert';

interface TopHeaderProps {
    contactName?: string;
    onDelete?: () => void;
    onShare?: () => void;
    onAccept?: () => void;
    isOnline?: boolean;
    isTyping?: boolean;
    status?: 'pending' | 'incoming' | 'connected';
    lastSeen?: string;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
    contactName, onDelete, onShare, onAccept, isOnline, isTyping, status, lastSeen
}) => (
    <Box sx={{
        p: 1.5,
        px: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'background.surface',
        borderBottom: '1px solid',
        borderColor: 'divider',
        height: '60px',
        boxSizing: 'border-box'
    }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer' }}>
            <Avatar size="sm">{contactName ? contactName[0] : ''}</Avatar>
            <Box>
                <Typography level="body-md" sx={{ fontWeight: 500 }}>{contactName || 'Selecciona un chat'}</Typography>
                {contactName && (
                    <Typography
                        level="body-xs"
                        color={isTyping ? "primary" : "neutral"}
                        sx={{ fontWeight: isTyping ? 500 : 400 }}
                    >
                        {isTyping ? 'escribiendo...' : (
                            status === 'pending' ? 'Esperando que acepte...' :
                                status === 'incoming' ? 'Solicitud de contacto' :
                                    (isOnline ? 'en línea' : (lastSeen ? `visto a las ${new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'desconectado'))
                        )}
                    </Typography>
                )}
            </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            {status === 'incoming' && (
                <Button
                    size="sm"
                    variant="solid"
                    color="primary"
                    startDecorator={<CheckIcon />}
                    onClick={onAccept}
                    sx={{ borderRadius: 'xl', mr: 1, fontWeight: 600 }}
                >
                    Aceptar Solicitud
                </Button>
            )}

            {contactName && (
                <>
                    <Tooltip title="Buscar en el chat" variant="soft">
                        <IconButton size="md" variant="plain" color="neutral"><SearchIcon sx={{ fontSize: '22px' }} /></IconButton>
                    </Tooltip>
                    <Tooltip title="Llamada de voz" variant="soft">
                        <IconButton size="md" variant="plain" color="neutral"><LocalPhoneIcon sx={{ fontSize: '22px' }} /></IconButton>
                    </Tooltip>
                    <Tooltip title="Videollamada" variant="soft">
                        <IconButton size="md" variant="plain" color="neutral"><VideocamIcon sx={{ fontSize: '24px' }} /></IconButton>
                    </Tooltip>
                    <Box sx={{ width: '1px', height: '24px', backgroundColor: 'divider', mx: 0.5 }} />
                    <IconButton size="md" variant="plain" color="neutral"><MoreVertIcon /></IconButton>
                </>
            )}
        </Box>
    </Box>
);
