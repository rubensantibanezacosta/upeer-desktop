import React from 'react';
import { Box, IconButton, Avatar, Tooltip } from '@mui/joy';
import ChatIcon from '@mui/icons-material/Chat';
import DonutLargeIcon from '@mui/icons-material/DonutLarge';
import GroupsIcon from '@mui/icons-material/Groups';
import SettingsIcon from '@mui/icons-material/Settings';

interface NavigationRailProps {
    myIp: string;
    myAvatar?: string | null;
    myInitial?: string;
    onOpenSettings?: () => void;
    onOpenIdentity?: () => void;
    activeView?: 'chat' | 'settings';
}

export const NavigationRail: React.FC<NavigationRailProps> = ({
    myIp,
    myAvatar,
    myInitial,
    onOpenSettings,
    onOpenIdentity,
    activeView = 'chat',
}) => (
    <Box sx={{
        width: '64px',
        minWidth: '64px',
        flexShrink: 0,
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
                    <IconButton
                        variant={activeView === 'chat' ? 'soft' : 'plain'}
                        color={activeView === 'chat' ? 'primary' : 'neutral'}
                        onClick={() => onOpenSettings && activeView === 'settings' && onOpenSettings()}
                        sx={{ borderRadius: 'sm' }}
                    >
                        <ChatIcon />
                    </IconButton>
                </Box>
            </Tooltip>
            <Tooltip title="Actualizaciones" placement="right">
                <IconButton variant="plain" color="neutral" sx={{ borderRadius: 'sm' }}>
                    <DonutLargeIcon />
                </IconButton>
            </Tooltip>
            <Tooltip title="Comunidades" placement="right">
                <IconButton variant="plain" color="neutral" sx={{ borderRadius: 'sm' }}>
                    <GroupsIcon />
                </IconButton>
            </Tooltip>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Tooltip title="Ajustes" placement="right">
                <IconButton
                    variant={activeView === 'settings' ? 'soft' : 'plain'}
                    color={activeView === 'settings' ? 'primary' : 'neutral'}
                    onClick={onOpenSettings}
                    sx={{ borderRadius: 'sm' }}
                >
                    <SettingsIcon />
                </IconButton>
            </Tooltip>
            <Tooltip title="Mi perfil" placement="right">
                <Avatar
                    size="sm"
                    src={myAvatar || undefined}
                    onClick={onOpenIdentity}
                    sx={{
                        cursor: 'pointer',
                        mt: 1,
                        width: 32,
                        height: 32,
                        borderRadius: 'md',
                        background: myAvatar ? 'transparent' : 'linear-gradient(135deg, var(--joy-palette-primary-500), var(--joy-palette-primary-700))',
                        fontWeight: 700,
                        fontSize: '14px',
                        border: '2px solid',
                        borderColor: activeView === 'settings' ? 'primary.500' : 'transparent',
                        transition: 'border-color 0.2s',
                    }}
                >
                    {!myAvatar && (myInitial || '?')}
                </Avatar>
            </Tooltip>
        </Box>
    </Box>
);
