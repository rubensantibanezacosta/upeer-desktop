import React from 'react';
import { Box, IconButton, Avatar, Tooltip } from '@mui/joy';
import ChatIcon from '@mui/icons-material/Chat';
import DonutLargeIcon from '@mui/icons-material/DonutLarge';
import GroupsIcon from '@mui/icons-material/Groups';
import SettingsIcon from '@mui/icons-material/Settings';

export const NavigationRail: React.FC<{ myIp: string }> = ({ myIp }) => (
    <Box sx={{
        width: '64px',
        minWidth: '64px',
        backgroundColor: 'background.surface',
        borderRight: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 2,
        paddingBottom: 2,
        zIndex: 10
    }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1 }}>
            <Tooltip title="Chats" placement="right">
                <Box>
                    <IconButton variant="plain" color="neutral"><ChatIcon /></IconButton>
                </Box>
            </Tooltip>
            <Tooltip title="Actualizaciones" placement="right">
                <IconButton variant="plain" color="neutral"><DonutLargeIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Comunidades" placement="right">
                <IconButton variant="plain" color="neutral"><GroupsIcon /></IconButton>
            </Tooltip>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Tooltip title="Ajustes" placement="right">
                <IconButton variant="plain" color="neutral"><SettingsIcon /></IconButton>
            </Tooltip>
            {/* El avatar inferior puede copiar la ubicación de red de forma discreta si es necesario */}
            <Tooltip title="Mi Identidad" placement="right">
                <Avatar
                    size="sm"
                    src=""
                    onClick={() => {
                        navigator.clipboard.writeText(myIp);
                    }}
                    sx={{ cursor: 'pointer', mt: 1, width: 32, height: 32 }}
                />
            </Tooltip>
        </Box>
    </Box>
);
