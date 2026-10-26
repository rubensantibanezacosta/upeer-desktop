import React from 'react';
import { Box, IconButton, Avatar, Tooltip, Badge } from '@mui/joy';
import { MessageCircle, CircleDashed, Users, Settings, Phone, Video } from 'lucide-react';
import { SyncStatusIndicator } from './SyncStatusIndicator.js';
import type { SettingsSection } from '../ui/settings/types.js';

interface NavigationRailProps {
    myIp: string;
    myAvatar?: string | null;
    myInitial?: string;
    onOpenChats?: () => void;
    onOpenCalls?: () => void;
    onOpenSettings?: () => void;
    onOpenIdentity?: () => void;
    onOpenDevices?: () => void;
    activeView?: 'chat' | 'calls' | 'settings';
    activeSection?: SettingsSection | null;
    activeCallKind?: 'audio' | 'video';
    unreadChatCount?: number;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({
    myIp: _myIp,
    myAvatar,
    myInitial,
    onOpenChats,
    onOpenCalls,
    onOpenSettings,
    onOpenIdentity,
    onOpenDevices,
    activeView = 'chat',
    activeSection = null,
    activeCallKind,
    unreadChatCount = 0,
}) => {
    const onProfileSection = activeView === 'settings' && activeSection === 'perfil';
    const onDevicesSection = activeView === 'settings' && activeSection === 'dispositivos';
    return (
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
            <Tooltip title={unreadChatCount > 0 ? `Chats · ${unreadChatCount} sin leer` : 'Chats'} placement="right">
                <Box>
                    <IconButton
                        aria-label={unreadChatCount > 0 ? `Chats, ${unreadChatCount} sin leer` : 'Chats'}
                        variant={activeView === 'chat' ? 'soft' : 'plain'}
                        color={activeView === 'chat' ? 'primary' : 'neutral'}
                        onClick={onOpenChats}
                        sx={{ borderRadius: '50%' }}
                    >
                        <Badge
                            badgeContent={unreadChatCount > 99 ? '99+' : unreadChatCount}
                            invisible={unreadChatCount < 1}
                            color="danger"
                            size="sm"
                            sx={{ '& .MuiBadge-badge': { top: 1, right: 1, fontSize: '10px', minWidth: 16, height: 16, px: 0.4 } }}
                        >
                            <MessageCircle style={{ fontSize: 22 }} />
                        </Badge>
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
                        sx={{ borderRadius: '50%' }}
                    >
                        {activeCallKind === 'video'
                            ? <Video style={{ fontSize: 22, color: 'var(--joy-palette-success-400)' }} />
                            : <Phone style={{ fontSize: 22, color: activeCallKind === 'audio' ? 'var(--joy-palette-success-400)' : undefined }} />}
                    </IconButton>
                </Box>
            </Tooltip>
            <Tooltip title="Actualizaciones" placement="right">
                <IconButton variant="plain" color="neutral" sx={{ borderRadius: '50%' }}>
                    <CircleDashed style={{ fontSize: 22 }} />
                </IconButton>
            </Tooltip>
            <Tooltip title="Comunidades" placement="right">
                <IconButton variant="plain" color="neutral" sx={{ borderRadius: '50%' }}>
                    <Users style={{ fontSize: 22 }} />
                </IconButton>
            </Tooltip>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <SyncStatusIndicator onOpenDevices={onOpenDevices} active={onDevicesSection} />
            <Tooltip title="Ajustes" placement="right">
                <IconButton
                    aria-label="Ajustes"
                    variant={activeView === 'settings' ? 'soft' : 'plain'}
                    color={activeView === 'settings' ? 'primary' : 'neutral'}
                    onClick={onOpenSettings}
                    sx={{ borderRadius: '50%' }}
                >
                    <Settings style={{ fontSize: 22 }} />
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
                        borderRadius: '50%',
                        background: myAvatar ? 'transparent' : 'linear-gradient(135deg, var(--joy-palette-primary-500), var(--joy-palette-primary-700))',
                        fontWeight: 700,
                        fontSize: '14px',
                        border: '2px solid',
                        borderColor: onProfileSection ? 'primary.500' : 'transparent',
                        transition: 'border-color 0.2s',
                    }}
                >
                    {!myAvatar && (myInitial || '?')}
                </Avatar>
            </Tooltip>
        </Box>
    </Box>
    );
};
