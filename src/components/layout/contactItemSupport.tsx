import React from 'react';
import { Box, Tooltip, Typography } from '@mui/joy';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import NotificationsIcon from '@mui/icons-material/Notifications';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import SecurityIcon from '@mui/icons-material/Security';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import MicIcon from '@mui/icons-material/Mic';
import { getFileIcon } from '../../utils/fileIcons.js';
import { highlightText } from '../../utils/highlightText.js';
import type { Contact } from '../../types/chat.js';
import { getContactCardSummary } from '../../features/chat/message/messageItemSupport.js';

const parseJsonMessage = (message: string) => {
    try {
        return JSON.parse(message);
    } catch {
        return undefined;
    }
};

export const getTrustIndicator = (contact: Contact, showTooltip = true) => {
    const score: number | undefined = contact.vouchScore;
    if (score === undefined) {
        return null;
    }

    let icon = null;
    let label = 'Reputación estándar';

    if (score < 40) {
        icon = <GppMaybeIcon sx={{ fontSize: 12, color: 'danger.600' }} />;
        label = `Baja reputación (${score}/100) - Ten cuidado`;
    } else if (score >= 80) {
        icon = <VerifiedUserIcon sx={{ fontSize: 12, color: 'success.600' }} />;
        label = `Alta reputación (${score}/100) - Muy confiable`;
    } else if (score >= 65) {
        icon = <CheckCircleIcon sx={{ fontSize: 12, color: 'primary.600' }} />;
        label = `Buena reputación (${score}/100) - Confiable`;
    } else if (score === 50) {
        icon = <NewReleasesIcon sx={{ fontSize: 12, color: 'neutral.600' }} />;
        label = 'Sin historial de red aún';
    } else {
        icon = <SecurityIcon sx={{ fontSize: 12, color: 'neutral.600' }} />;
        label = `Reputación estándar (${score}/100)`;
    }

    if (!showTooltip) {
        return icon;
    }

    return (
        <Tooltip title={label} variant="solid" size="sm" placement="top">
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {icon}
            </Box>
        </Tooltip>
    );
};

export const formatContactTime = (iso?: string) => {
    if (!iso) {
        return '';
    }
    const date = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 86400000 && now.getDate() === date.getDate()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString();
};

export const renderPendingLabel = (contact: Contact) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflow: 'hidden' }}>
        {contact.status === 'pending'
            ? <HourglassEmptyIcon sx={{ fontSize: 14, flexShrink: 0 }} />
            : <NotificationsIcon sx={{ fontSize: 14, color: 'primary.500', flexShrink: 0 }} />}
        <Typography level="body-sm" noWrap sx={{ fontStyle: 'inherit', color: contact.status === 'incoming' ? 'primary.500' : 'inherit' }}>
            {contact.status === 'pending' ? 'Esperando respuesta...' : 'Solicitud de contacto recibida'}
        </Typography>
    </Box>
);

export const renderLastMessagePreview = (contact: Contact, highlight: string) => {
    if (!contact.lastMessage) {
        return '';
    }
    const contactCardSummary = getContactCardSummary(contact.lastMessage);
    if (contactCardSummary) {
        return contactCardSummary;
    }

    if (contact.lastMessage.startsWith('{') && contact.lastMessage.endsWith('}')) {
        const parsed = parseJsonMessage(contact.lastMessage);
        if (parsed?.type === 'file') {
            if (parsed.isVoiceNote) {
                return (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        <MicIcon sx={{ fontSize: 16, opacity: 0.8 }} />
                        <span>Nota de voz</span>
                    </Box>
                );
            }
            return (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <Box component="span" sx={{ display: 'flex', opacity: 0.8 }}>
                        {getFileIcon(parsed.mimeType || '', parsed.fileName || '')}
                    </Box>
                    <span>{parsed.fileName}</span>
                </Box>
            );
        }
        if (typeof parsed?.text === 'string') {
            return parsed.text || '';
        }
    }

    if (contact.lastMessage.startsWith('FILE_TRANSFER|')) {
        const parts = contact.lastMessage.split('|');
        if (parts.length >= 6) {
            return (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <Box component="span" sx={{ display: 'flex', opacity: 0.8 }}>
                        {getFileIcon(parts[4] || '', parts[2] || '')}
                    </Box>
                    <span>{parts[2]}</span>
                </Box>
            );
        }
    }

    return highlight ? highlightText(contact.lastMessage, highlight) : contact.lastMessage;
};

export const renderMessageStatusIcon = (contact: Contact) => {
    if (!contact.lastMessageIsMine) {
        return null;
    }
    if (contact.lastMessageStatus === 'failed') {
        return <ErrorOutlineIcon sx={{ fontSize: '16px', color: 'danger.500' }} />;
    }
    if (contact.lastMessageStatus === 'sent' || contact.lastMessageStatus === 'vaulted') {
        return <DoneIcon sx={{ fontSize: '16px', opacity: 0.7 }} />;
    }
    return (
        <DoneAllIcon
            sx={{
                fontSize: '16px',
                color: contact.lastMessageStatus === 'read' ? '#53bdeb' : 'inherit',
                opacity: contact.lastMessageStatus === 'read' ? 1 : 0.7,
            }}
        />
    );
};