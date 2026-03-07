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
import LockIcon from '@mui/icons-material/Lock';

interface TopHeaderProps {
    contactName?: string;
    onDelete?: () => void;
    onShare?: () => void;
    onAccept?: () => void;
    isOnline?: boolean;
    isTyping?: boolean;
    status?: 'pending' | 'incoming' | 'connected';
    lastSeen?: string;
    onShowSecurity?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
    contactName, onDelete, onShare, onAccept, isOnline, isTyping, status, lastSeen, onShowSecurity
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ position: 'relative' }}>
                <Avatar size="sm">{contactName ? contactName[0] : ''}</Avatar>
                {status === 'connected' && (
                    <Tooltip title="Protegido con E2EE" variant="soft">
                        <IconButton
                            size="sm"
                            variant="solid"
                            color="success"
                            onClick={onShowSecurity}
                            sx={{
                                position: 'absolute',
                                bottom: -2,
                                right: -2,
                                width: 14,
                                height: 14,
                                minWidth: 14,
                                minHeight: 14,
                                p: 0,
                                borderRadius: '50%',
                                border: '2px solid',
                                borderColor: 'background.surface',
                                '&:hover': {
                                    backgroundColor: 'success.main',
                                    transform: 'scale(1.2)'
                                },
                                transition: 'all 0.2s'
                            }}
                        >
                            <LockIcon sx={{ fontSize: '8px', color: 'white' }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
            <Box>
                <Typography level="body-md" sx={{ fontWeight: 500 }}>{contactName || 'Selecciona un chat'}</Typography>
                {contactName && (
                    <Typography
                        level="body-xs"
                        color={isTyping ? "primary" : "neutral"}
                        sx={{ fontWeight: isTyping ? 500 : 400 }}
                    >
                        {isTyping ? 'Escribiendo...' : (
                            status === 'pending' ? 'Esperando que acepte...' :
                                status === 'incoming' ? 'Solicitud de contacto' :
                                    (isOnline ? 'En línea' : (lastSeen ? `Conectado a las ${new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Desconectado'))
                        )}
                    </Typography>
                )}
            </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            {status === 'incoming' && onAccept && (
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
