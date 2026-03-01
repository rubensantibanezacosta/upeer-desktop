import React from 'react';
import { Box, Typography, Avatar, IconButton } from '@mui/joy';
import ChatIcon from '@mui/icons-material/Chat';
import MoreVertIcon from '@mui/icons-material/MoreVert';

interface SidebarHeaderProps {
    onShowMyIdentity: () => void;
    onAddNew: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ onShowMyIdentity, onAddNew }) => (
    <Box sx={{
        p: 2,
        pt: 2.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'background.surface',
        height: '60px',
        boxSizing: 'border-box'
    }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar
                size="sm"
                onClick={onShowMyIdentity}
                sx={{ cursor: 'pointer', '--Avatar-size': '32px' }}
            >
                YO
            </Avatar>
            <Typography level="h4" sx={{ fontWeight: 600 }}>RevelNest</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton size="sm" variant="plain" color="neutral" onClick={onAddNew}><ChatIcon /></IconButton>
            <IconButton size="sm" variant="plain" color="neutral"><MoreVertIcon /></IconButton>
        </Box>
    </Box>
);
