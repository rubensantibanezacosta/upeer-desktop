import React from 'react';
import { Box, Button, IconButton, Tooltip } from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import LocalPhoneIcon from '@mui/icons-material/LocalPhone';
import VideocamIcon from '@mui/icons-material/Videocam';
import CheckIcon from '@mui/icons-material/Check';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';

interface TopHeaderActionsProps {
    status?: 'pending' | 'incoming' | 'connected' | 'offline' | 'blocked';
    onAccept?: () => void;
    contactName?: string;
    isGroup?: boolean;
    isAdmin?: boolean;
    onInviteMembers?: () => void;
    onSearch?: () => void;
}

export const TopHeaderActions: React.FC<TopHeaderActionsProps> = ({
    status,
    onAccept,
    contactName,
    isGroup,
    isAdmin,
    onInviteMembers,
    onSearch,
}) => (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        {status === 'incoming' && onAccept && (
            <Button size="sm" variant="solid" color="primary" startDecorator={<CheckIcon />} onClick={onAccept} sx={{ borderRadius: 'md', mr: 1, fontWeight: 600 }}>
                Aceptar Solicitud
            </Button>
        )}

        {contactName && (
            <>
                <Tooltip title="Buscar en el chat" variant="soft">
                    <IconButton aria-label="Buscar en el chat" size="md" variant="plain" color="neutral" onClick={onSearch}><SearchIcon sx={{ fontSize: '22px' }} /></IconButton>
                </Tooltip>
                <Tooltip title="Llamada de voz" variant="soft">
                    <IconButton aria-label="Llamada de voz" size="md" variant="plain" color="neutral"><LocalPhoneIcon sx={{ fontSize: '22px' }} /></IconButton>
                </Tooltip>
                <Tooltip title="Videollamada" variant="soft">
                    <IconButton aria-label="Videollamada" size="md" variant="plain" color="neutral"><VideocamIcon sx={{ fontSize: '24px' }} /></IconButton>
                </Tooltip>
                {isGroup && isAdmin && onInviteMembers && (
                    <Tooltip title="Añadir miembros" variant="soft">
                        <IconButton aria-label="Añadir miembros" size="md" variant="plain" color="neutral" onClick={onInviteMembers}>
                            <PersonAddAlt1Icon sx={{ fontSize: '22px' }} />
                        </IconButton>
                    </Tooltip>
                )}
                <Box sx={{ width: '1px', height: '24px', backgroundColor: 'divider', mx: 0.5 }} />
                <IconButton aria-label="Más acciones" size="md" variant="plain" color="neutral"><MoreVertIcon /></IconButton>
            </>
        )}
    </Box>
);