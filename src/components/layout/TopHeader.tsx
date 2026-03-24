import React, { useRef, useState } from 'react';
import {
    Box,
    Typography,
    IconButton,
    Avatar,
    Button,
    Tooltip,
    Input
} from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import LocalPhoneIcon from '@mui/icons-material/LocalPhone';
import VideocamIcon from '@mui/icons-material/Videocam';
import CheckIcon from '@mui/icons-material/Check';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import GroupsIcon from '@mui/icons-material/Groups';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SecurityIcon from '@mui/icons-material/Security';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import EditIcon from '@mui/icons-material/Edit';
import { resizeImageToDataUrl } from '../ui/settings/shared.js';

interface TopHeaderProps {
    contactName?: string;
    avatar?: string;
    onDelete?: () => void;
    onShare?: () => void;
    onAccept?: () => void;
    isOnline?: boolean;
    isTyping?: boolean;
    status?: 'pending' | 'incoming' | 'connected' | 'offline' | 'blocked';
    lastSeen?: string;
    onShowSecurity?: () => void;
    isGroup?: boolean;
    memberCount?: number;
    vouchScore?: number;
    isAdmin?: boolean;
    groupId?: string;
    onUpdateGroup?: (fields: { name?: string; avatar?: string | null }) => Promise<void>;
    onInviteMembers?: () => void;
    onOpenInfo?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
    contactName, avatar, onDelete: _onDelete, onShare: _onShare, onAccept, isOnline, isTyping, status, lastSeen, onShowSecurity: _onShowSecurity,
    isGroup, memberCount, vouchScore, isAdmin, groupId, onUpdateGroup, onInviteMembers, onOpenInfo
}) => {
    const avatarFileRef = useRef<HTMLInputElement>(null);
    const [editingName, setEditingName] = useState(false);
    const [nameValue, setNameValue] = useState('');

    const handleAvatarClick = () => {
        if (isGroup && isAdmin) avatarFileRef.current?.click();
    };

    const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onUpdateGroup || !groupId) return;
        resizeImageToDataUrl(file)
            .then((dataUrl) => onUpdateGroup({ avatar: dataUrl }))
            .catch(() => undefined);
        e.target.value = '';
    };

    const startEditName = () => {
        setNameValue(contactName || '');
        setEditingName(true);
    };

    const commitNameEdit = () => {
        const trimmed = nameValue.trim();
        if (trimmed && trimmed !== contactName && onUpdateGroup && groupId) {
            onUpdateGroup({ name: trimmed });
        }
        setEditingName(false);
    };
    const formatLastSeen = (iso: string) => {
        const date = new Date(iso);
        const now = Date.now();
        const diffMs = now - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'hace un momento';
        if (diffMin < 60) return `hace ${diffMin} min`;
        const diffH = Math.floor(diffMin / 60);
        if (diffH < 24 && date.toDateString() === new Date().toDateString())
            return `hoy a las ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        return `el ${date.toLocaleDateString([], { day: '2-digit', month: 'short' })} a las ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };
    const getTrustIndicator = () => {
        if (vouchScore === undefined) return null;

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
            label = 'Reputación estándar';
        }

        return (
            <Tooltip title={label} variant="solid" size="sm" placement="bottom">
                <Box sx={{ display: 'flex', alignItems: 'center', ml: 1, cursor: 'help' }}>
                    {icon}
                </Box>
            </Tooltip>
        );
    };

    return (
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
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    minWidth: 0,
                    borderRadius: 'lg',
                    cursor: !isGroup && onOpenInfo ? 'pointer' : 'default',
                    px: !isGroup && onOpenInfo ? 0.75 : 0,
                    py: !isGroup && onOpenInfo ? 0.5 : 0,
                    ml: !isGroup && onOpenInfo ? -0.75 : 0,
                    transition: 'background-color 0.15s ease',
                    '&:hover': !isGroup && onOpenInfo ? { backgroundColor: 'background.level1' } : undefined,
                }}
                onClick={!isGroup ? onOpenInfo : undefined}
                onKeyDown={!isGroup && onOpenInfo ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenInfo();
                    }
                } : undefined}
                role={!isGroup && onOpenInfo ? 'button' : undefined}
                tabIndex={!isGroup && onOpenInfo ? 0 : -1}
            >
                {/* Hidden file input for group avatar */}
                {isGroup && isAdmin && (
                    <input
                        type="file"
                        accept="image/*"
                        ref={avatarFileRef}
                        style={{ display: 'none' }}
                        onChange={handleAvatarFileChange}
                    />
                )}
                <Box
                    sx={{ position: 'relative', cursor: isGroup && isAdmin ? 'pointer' : 'default' }}
                    onClick={handleAvatarClick}
                >
                    {isGroup ? (
                        <Avatar
                            size="sm"
                            src={avatar || undefined}
                            color="primary"
                            variant="soft"
                            sx={{
                                borderRadius: 'md',
                                ...(!avatar ? { background: 'linear-gradient(135deg, var(--joy-palette-primary-500), var(--joy-palette-primary-700))' } : {})
                            }}
                        >
                            {!avatar && <GroupsIcon sx={{ fontSize: 18, color: 'white' }} />}
                        </Avatar>
                    ) : (
                        <Avatar size="sm" src={avatar || undefined} sx={{ borderRadius: 'md' }}>{contactName ? contactName[0] : ''}</Avatar>
                    )}
                    {isGroup && isAdmin && (
                        <Box sx={{
                            position: 'absolute', inset: 0, borderRadius: 'md',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.45)', opacity: 0,
                            transition: 'opacity 0.15s',
                            '&:hover': { opacity: 1 }
                        }}>
                            <CameraAltIcon sx={{ fontSize: 13, color: 'white' }} />
                        </Box>
                    )}
                </Box>
                <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {isGroup && isAdmin && editingName ? (
                            <Input
                                size="sm"
                                variant="outlined"
                                value={nameValue}
                                autoFocus
                                onChange={(e) => setNameValue(e.target.value)}
                                onBlur={commitNameEdit}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitNameEdit();
                                    if (e.key === 'Escape') setEditingName(false);
                                }}
                                sx={{ fontSize: '0.875rem', fontWeight: 500, height: '26px', py: 0, width: '160px' }}
                            />
                        ) : (
                            <>
                                <Typography level="body-md" sx={{ fontWeight: 500 }}>
                                    {contactName || 'Selecciona un chat'}
                                </Typography>
                                {isGroup && isAdmin && contactName && (
                                    <Tooltip title="Editar nombre del grupo" variant="soft" size="sm">
                                        <IconButton size="sm" variant="plain" color="neutral" onClick={startEditName}
                                            sx={{ minHeight: 'auto', p: 0.25 }}>
                                            <EditIcon sx={{ fontSize: 13 }} />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </>
                        )}
                        {!isGroup && getTrustIndicator()}
                    </Box>
                    {contactName && (
                        <Typography
                            level="body-xs"
                            color={isTyping ? "primary" : "neutral"}
                            sx={{ fontWeight: isTyping ? 500 : 400 }}
                        >
                            {isGroup
                                ? `${memberCount ?? 0} miembro${(memberCount ?? 0) !== 1 ? 's' : ''}`
                                : (isTyping ? 'Escribiendo...' : (
                                    status === 'pending' ? 'Esperando que acepte...' :
                                        status === 'incoming' ? 'Solicitud de contacto' :
                                            (isOnline ? 'En línea' : (lastSeen ? `Última vez ${formatLastSeen(lastSeen)}` : 'Desconectado'))
                                ))}
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
                        sx={{ borderRadius: 'md', mr: 1, fontWeight: 600 }}
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
                        {isGroup && isAdmin && onInviteMembers && (
                            <Tooltip title="Añadir miembros" variant="soft">
                                <IconButton size="md" variant="plain" color="neutral" onClick={onInviteMembers}>
                                    <PersonAddAlt1Icon sx={{ fontSize: '22px' }} />
                                </IconButton>
                            </Tooltip>
                        )}
                        <Box sx={{ width: '1px', height: '24px', backgroundColor: 'divider', mx: 0.5 }} />
                        <IconButton size="md" variant="plain" color="neutral"><MoreVertIcon /></IconButton>
                    </>
                )}
            </Box>
        </Box>
    );
};
