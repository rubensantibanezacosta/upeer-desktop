import React, { useRef, useState } from 'react';
import {
    Box,
    Typography,
    IconButton,
    Avatar,
    Button,
    Tooltip,
    Badge,
    Input
} from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import LocalPhoneIcon from '@mui/icons-material/LocalPhone';
import VideocamIcon from '@mui/icons-material/Videocam';
import CheckIcon from '@mui/icons-material/Check';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import LockIcon from '@mui/icons-material/Lock';
import GroupsIcon from '@mui/icons-material/Groups';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SecurityIcon from '@mui/icons-material/Security';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';

interface TopHeaderProps {
    contactName?: string;
    avatar?: string;
    onDelete?: () => void;
    onShare?: () => void;
    onAccept?: () => void;
    isOnline?: boolean;
    isTyping?: boolean;
    status?: 'pending' | 'incoming' | 'connected' | 'blocked';
    lastSeen?: string;
    onShowSecurity?: () => void;
    isGroup?: boolean;
    memberCount?: number;
    vouchScore?: number;
    isAdmin?: boolean;
    groupId?: string;
    onUpdateGroup?: (fields: { name?: string; avatar?: string | null }) => Promise<void>;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
    contactName, avatar, onDelete, onShare, onAccept, isOnline, isTyping, status, lastSeen, onShowSecurity,
    isGroup, memberCount, vouchScore, isAdmin, groupId, onUpdateGroup
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
        // BUG EI fix: sin este límite, una imagen RAW de 50 MB se leería entera en
        // memoria antes del recorte canvas. El FileReader convierte a base64
        // (~33 % más grande), lo que puede causar OOM en el proceso renderer.
        const MAX_AVATAR_BYTES = 10 * 1024 * 1024; // 10 MB
        if (file.size > MAX_AVATAR_BYTES) {
            // Silencioso: el usuario elegirá otro archivo
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 256; canvas.height = 256;
                const ctx = canvas.getContext('2d')!;
                const side = Math.min(img.width, img.height);
                const sx = (img.width - side) / 2;
                const sy = (img.height - side) / 2;
                ctx.drawImage(img, sx, sy, side, side, 0, 0, 256, 256);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                onUpdateGroup({ avatar: dataUrl });
            };
            img.src = ev.target?.result as string;
        };
        reader.readAsDataURL(file);
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
                            sx={!avatar ? { background: 'linear-gradient(135deg, var(--joy-palette-primary-500), var(--joy-palette-primary-700))' } : {}}
                        >
                            {!avatar && <GroupsIcon sx={{ fontSize: 18, color: 'white' }} />}
                        </Avatar>
                    ) : (
                        <Avatar size="sm" src={avatar || undefined}>{contactName ? contactName[0] : ''}</Avatar>
                    )}
                    {isGroup && isAdmin && (
                        <Box sx={{
                            position: 'absolute', inset: 0, borderRadius: '50%',
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
                        sx={{ borderRadius: 'xl', mr: 1, fontWeight: 600 }}
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
                        <Box sx={{ width: '1px', height: '24px', backgroundColor: 'divider', mx: 0.5 }} />
                        <IconButton size="md" variant="plain" color="neutral"><MoreVertIcon /></IconButton>
                    </>
                )}
            </Box>
        </Box>
    );
};
