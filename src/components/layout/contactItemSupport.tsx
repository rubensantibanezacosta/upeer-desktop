import React from 'react';
import { Box, Typography } from '@mui/joy';
import { Hourglass, Bell, Check, CheckCheck, CircleAlert, Mic } from 'lucide-react';
import { getFileIcon } from '../../utils/fileIcons.js';
import { highlightText } from '../../utils/highlightText.js';
import type { Contact } from '../../types/chat.js';
import { getContactCardSummary } from '../../features/chat/message/messageItemSupport.js';
import { parseCallSystemEvent } from '../../features/chat/chatAreaSupport.js';
import { formatMessageTime } from '../../utils/dateTime.js';

const parseJsonMessage = (message: string) => {
    try {
        return JSON.parse(message);
    } catch {
        return undefined;
    }
};

export const formatContactTime = (iso?: string | number | null) => formatMessageTime(iso);

export const renderPendingLabel = (contact: Contact) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflow: 'hidden' }}>
        {contact.status === 'pending'
            ? <Hourglass style={{ fontSize: 14, flexShrink: 0 }} />
            : <Bell style={{ fontSize: 14, color: 'var(--joy-palette-primary-500)', flexShrink: 0 }} />}
        <Typography level="body-sm" noWrap sx={{ fontStyle: 'inherit', color: contact.status === 'incoming' ? 'primary.500' : 'inherit' }}>
            {contact.status === 'pending' ? 'Esperando respuesta...' : 'Solicitud de contacto recibida'}
        </Typography>
    </Box>
);

export const renderLastMessagePreview = (contact: Contact, highlight: string) => {
    if (!contact.lastMessage) {
        return '';
    }
    const systemMessage = contact.lastMessage.startsWith('__SYS__|')
        ? contact.lastMessage.slice(8)
        : contact.lastMessage;
    const callEvent = parseCallSystemEvent(systemMessage);
    if (callEvent) {
        const label = callEvent.kind === 'video' ? 'Videollamada' : 'Llamada de voz';
        if (callEvent.duration) return `${label} · ${callEvent.duration}`;
        return callEvent.outcome === 'rejected' ? `${label} rechazada` : `${label} perdida`;
    }
    if (systemMessage !== contact.lastMessage) {
        return systemMessage;
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
                        <Mic style={{ fontSize: 16, opacity: 0.8 }} />
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
        return <CircleAlert style={{ fontSize: 16, color: 'var(--joy-palette-danger-500)' }} />;
    }
    if (contact.lastMessageStatus === 'sent' || contact.lastMessageStatus === 'vaulted') {
        return <Check style={{ fontSize: 16, opacity: 0.7 }} />;
    }
    return (
        <CheckCheck
            style={{
                fontSize: 16,
                color: contact.lastMessageStatus === 'read' ? '#53bdeb' : 'inherit',
                opacity: contact.lastMessageStatus === 'read' ? 1 : 0.7,
            }}
        />
    );
};