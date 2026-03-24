import React from 'react';
import { Box, Typography, IconButton } from '@mui/joy';
import EditNoteIcon from '@mui/icons-material/EditNote';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

interface SidebarHeaderProps {
    onAddNew: () => void;
    onCreateGroup?: () => void;
}

// Header principal — lista de chats
export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ onAddNew }) => (
    <Box sx={{
        p: 2, pt: 2.5,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: 'background.surface',
        height: '60px', boxSizing: 'border-box',
    }}>
        <Typography level="h4" sx={{ fontWeight: 600 }}>uPeer</Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton size="sm" variant="plain" color="neutral" onClick={onAddNew}>
                <EditNoteIcon />
            </IconButton>
            <IconButton size="sm" variant="plain" color="neutral">
                <MoreVertIcon />
            </IconButton>
        </Box>
    </Box>
);

// Header del panel "Nuevo chat"
export const NewChatHeader: React.FC<{ onBack: () => void }> = ({ onBack }) => (
    <Box sx={{
        px: 2, display: 'flex', alignItems: 'center', gap: 1.5,
        backgroundColor: 'background.surface',
        height: '60px', boxSizing: 'border-box',
    }}>
        <IconButton size="sm" variant="plain" color="neutral" onClick={onBack}>
            <ArrowBackIcon />
        </IconButton>
        <Typography level="h4" sx={{ fontWeight: 600 }}>Nuevo chat</Typography>
    </Box>
);

