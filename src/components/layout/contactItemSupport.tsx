import React from 'react';
import { Box, Typography } from '@mui/joy';
import { Hourglass, Bell, Check, CheckCheck, CircleAlert, Mic } from 'lucide-react';
import { getFileIcon, LIST_PREVIEW_ICON_SIZE } from '../../utils/fileIcons.js';
import { highlightText } from '../../utils/highlightText.js';
import type { Contact } from '../../types/chat.js';
import { getContactCardSummary } from '../../features/chat/message/messageItemSupport.js';
import { systemPreviewText } from '../../features/chat/chatAreaSupport.js';
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
    if (contact.latestReaction) {
        const { emoji, message } = contact.latestReaction;
        const inner = message ? renderLastMessagePreview({ ...contact, latestReaction: undefined, lastMessage: message }, highlight) : null;
        return (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <span>{emoji}</span>
                {typeof inner === 'string' ? (inner ? <span>{inner}</span> : null) : inner}
            </Box>
        );
    }
    if (!contact.lastMessage) {
        return '';
    }
    const systemMessage = systemPreviewText(contact.lastMessage);
    if (systemMessage) {
        return highlight ? highlightText(systemMessage, highlight) : systemMessage;
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
                        <Mic style={{ fontSize: LIST_PREVIEW_ICON_SIZE, opacity: 0.8 }} />
                        <span>Nota de voz</span>
                    </Box>
                );
            }
            return (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <Box component="span" sx={{ display: 'flex', opacity: 0.8 }}>
                        {getFileIcon(parsed.mimeType || '', parsed.fileName || '', LIST_PREVIEW_ICON_SIZE)}
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
                        {getFileIcon(parts[4] || '', parts[2] || '', LIST_PREVIEW_ICON_SIZE)}
                    </Box>
                    <span>{parts[2]}</span>
                </Box>
            );
        }
    }

    return highlight ? highlightText(contact.lastMessage, highlight) : contact.lastMessage;
};

export const renderMessageStatusIcon = (contact: Contact) => {
    if (contact.latestReaction || !contact.lastMessageIsMine) {
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