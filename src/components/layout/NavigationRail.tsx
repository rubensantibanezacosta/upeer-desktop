import React from 'react';
import { Box, IconButton, Avatar, Tooltip } from '@mui/joy';
import ChatIcon from '@mui/icons-material/Chat';
import ContactsRoundedIcon from '@mui/icons-material/ContactsRounded';
import DonutLargeIcon from '@mui/icons-material/DonutLarge';
import GroupsIcon from '@mui/icons-material/Groups';
import SettingsIcon from '@mui/icons-material/Settings';
import CallIcon from '@mui/icons-material/Call';
import VideocamIcon from '@mui/icons-material/Videocam';

interface NavigationRailProps {
    myIp: string;
    myAvatar?: string | null;
    myInitial?: string;
    onOpenChats?: () => void;
    onOpenContacts?: () => void;
    onOpenCalls?: () => void;
    onOpenSettings?: () => void;
    onOpenIdentity?: () => void;
    activeView?: 'chat' | 'contacts' | 'calls' | 'settings';
    activeCallKind?: 'audio' | 'video';
}

export const NavigationRail: React.FC<NavigationRailProps> = ({
    myIp: _myIp,
    myAvatar,
    myInitial,
    onOpenChats,
    onOpenContacts,
    onOpenCalls,
    onOpenSettings,
    onOpenIdentity,
    activeView = 'chat',
    activeCallKind,
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
                        aria-label="Chats"
                        variant={activeView === 'chat' ? 'soft' : 'plain'}
                        color={activeView === 'chat' ? 'primary' : 'neutral'}
                        onClick={onOpenChats}
                        sx={{ borderRadius: 'sm' }}
                    >
                        <ChatIcon />
                    </IconButton>
                </Box>
            </Tooltip>
            <Tooltip title="Contactos" placement="right">
                <Box>
                    <IconButton
                        aria-label="Contactos"
                        variant={activeView === 'contacts' ? 'soft' : 'plain'}
                        color={activeView === 'contacts' ? 'primary' : 'neutral'}
                        onClick={onOpenContacts}
                        sx={{ borderRadius: 'sm' }}
                    >
                        <ContactsRoundedIcon />
                    </IconButton>
                </Box>
            </Tooltip>
            <Tooltip title="Llamadas" placement="right">
                <Box>
                    <IconButton
                        aria-label="Llamadas"
                        variant={activeView === 'calls' ? 'soft' : 'plain'}
                        color={activeView === 'calls' ? 'primary' : 'neutral'}
                        onClick={onOpenCalls}
                        sx={{ borderRadius: 'sm' }}
                    >
                        {activeCallKind === 'video' ? <VideocamIcon color="success" /> : <CallIcon color={activeCallKind === 'audio' ? 'success' : undefined} />}
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
                    aria-label="Ajustes"
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
                    aria-label="Mi perfil"
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
