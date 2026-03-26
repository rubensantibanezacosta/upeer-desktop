import React from 'react';
import { Avatar, Box, Tooltip } from '@mui/joy';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SecurityIcon from '@mui/icons-material/Security';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import GroupsIcon from '@mui/icons-material/Groups';

export const formatTopHeaderLastSeen = (iso: string) => {
    const date = new Date(iso);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) {
        return 'hace un momento';
    }
    if (diffMin < 60) {
        return `hace ${diffMin} min`;
    }
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24 && date.toDateString() === new Date().toDateString()) {
        return `hoy a las ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return `el ${date.toLocaleDateString([], { day: '2-digit', month: 'short' })} a las ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

interface TrustIndicatorProps {
    vouchScore?: number;
}

export const TopHeaderTrustIndicator: React.FC<TrustIndicatorProps> = ({ vouchScore }) => {
    if (vouchScore === undefined) {
        return null;
    }

    let icon = null;
    let label = 'Reputación estándar';

    if (vouchScore < 40) {
        icon = <GppMaybeIcon sx={{ fontSize: 16, color: 'danger.600' }} />;
        label = 'Baja reputación - Ten cuidado';
    } else if (vouchScore >= 80) {
        icon = <VerifiedUserIcon sx={{ fontSize: 16, color: 'success.600' }} />;
        label = 'Alta reputación - Muy confiable';
    } else if (vouchScore >= 65) {
        icon = <CheckCircleIcon sx={{ fontSize: 16, color: 'primary.600' }} />;
        label = 'Buena reputación - Confiable';
    } else if (vouchScore === 50) {
        icon = <NewReleasesIcon sx={{ fontSize: 16, color: 'neutral.600' }} />;
        label = 'Nuevo contacto - Sin historial de avales';
    } else {
        icon = <SecurityIcon sx={{ fontSize: 16, color: 'neutral.600' }} />;
    }

    return (
        <Tooltip title={label} variant="solid" size="sm" placement="bottom">
            <Box sx={{ display: 'flex', alignItems: 'center', ml: 1, cursor: 'help' }}>
                {icon}
            </Box>
        </Tooltip>
    );
};

interface TopHeaderAvatarProps {
    isGroup?: boolean;
    isAdmin?: boolean;
    avatar?: string;
    contactName?: string;
    onAvatarClick: () => void;
    avatarFileRef: React.RefObject<HTMLInputElement | null>;
    onAvatarFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const TopHeaderAvatar: React.FC<TopHeaderAvatarProps> = ({
    isGroup,
    isAdmin,
    avatar,
    contactName,
    onAvatarClick,
    avatarFileRef,
    onAvatarFileChange,
}) => (
    <>
        {isGroup && isAdmin && (
            <input type="file" accept="image/*" ref={avatarFileRef} style={{ display: 'none' }} onChange={onAvatarFileChange} />
        )}
        <Box sx={{ position: 'relative', cursor: isGroup && isAdmin ? 'pointer' : 'default' }} onClick={onAvatarClick}>
            {isGroup ? (
                <Avatar
                    size="sm"
                    src={avatar || undefined}
                    color="primary"
                    variant="soft"
                    sx={{
                        borderRadius: 'md',
                        ...(!avatar ? { background: 'linear-gradient(135deg, var(--joy-palette-primary-500), var(--joy-palette-primary-700))' } : {}),
                    }}
                >
                    {!avatar && <GroupsIcon sx={{ fontSize: 18, color: 'white' }} />}
                </Avatar>
            ) : (
                <Avatar size="sm" src={avatar || undefined} sx={{ borderRadius: 'md' }}>
                    {contactName ? contactName[0] : ''}
                </Avatar>
            )}
            {isGroup && isAdmin && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 'md',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(0,0,0,0.45)',
                        opacity: 0,
                        transition: 'opacity 0.15s',
                        '&:hover': { opacity: 1 },
                    }}
                >
                    <CameraAltIcon sx={{ fontSize: 13, color: 'white' }} />
                </Box>
            )}
        </Box>
    </>
);