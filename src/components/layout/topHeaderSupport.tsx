import React from 'react';
import { Avatar, Box } from '@mui/joy';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import GroupsIcon from '@mui/icons-material/Groups';
import { TrustAvatarBadge } from './TrustAvatarBadge.js';

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

interface TopHeaderAvatarProps {
    isGroup?: boolean;
    isAdmin?: boolean;
    avatar?: string;
    contactName?: string;
    vouchScore?: number;
    onAvatarClick: () => void;
    avatarFileRef: React.RefObject<HTMLInputElement | null>;
    onAvatarFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const TopHeaderAvatar: React.FC<TopHeaderAvatarProps> = ({
    isGroup,
    isAdmin,
    avatar,
    contactName,
    vouchScore,
    onAvatarClick,
    avatarFileRef,
    onAvatarFileChange,
}) => (
    <>
        {isGroup && isAdmin && (
            <input type="file" accept="image/*" ref={avatarFileRef} style={{ display: 'none' }} onChange={onAvatarFileChange} />
        )}
        <Box sx={{ position: 'relative', cursor: isGroup && isAdmin ? 'pointer' : 'default' }} onClick={(event) => { event.stopPropagation(); onAvatarClick(); }}>
            <TrustAvatarBadge vouchScore={isGroup ? undefined : vouchScore}>
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
                    <Avatar size="sm" src={avatar || undefined}>
                        {contactName ? contactName[0] : ''}
                    </Avatar>
                )}
            </TrustAvatarBadge>
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