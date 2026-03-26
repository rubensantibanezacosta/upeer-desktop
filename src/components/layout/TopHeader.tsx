import React, { useRef, useState } from 'react';
import {
    Box,
    Typography,
    IconButton,
    Tooltip,
    Input
} from '@mui/joy';
import EditIcon from '@mui/icons-material/Edit';
import { resizeImageToDataUrl } from '../ui/settings/shared.js';
import { TopHeaderActions } from './TopHeaderActions.js';
import { formatTopHeaderLastSeen, TopHeaderAvatar, TopHeaderTrustIndicator } from './topHeaderSupport.js';

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

    const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !onUpdateGroup || !groupId) {
            return;
        }
        try {
            const dataUrl = await resizeImageToDataUrl(file);
            await onUpdateGroup({ avatar: dataUrl });
        } catch (error) {
            console.error('[TopHeader] No se pudo actualizar el avatar del grupo', error);
        }
        event.target.value = '';
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
                <TopHeaderAvatar isGroup={isGroup} isAdmin={isAdmin} avatar={avatar} contactName={contactName} onAvatarClick={handleAvatarClick} avatarFileRef={avatarFileRef} onAvatarFileChange={handleAvatarFileChange} />
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
                        {!isGroup && <TopHeaderTrustIndicator vouchScore={vouchScore} />}
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
                                            (isOnline ? 'En línea' : (lastSeen ? `Última vez ${formatTopHeaderLastSeen(lastSeen)}` : 'Desconectado'))
                                ))}
                        </Typography>
                    )}
                </Box>
            </Box>

            <TopHeaderActions status={status} onAccept={onAccept} contactName={contactName} isGroup={isGroup} isAdmin={isAdmin} onInviteMembers={onInviteMembers} />
        </Box>
    );
};
