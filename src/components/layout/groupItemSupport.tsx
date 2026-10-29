import React from 'react';
import { Avatar, Box } from '@mui/joy';
import { Check, CheckCheck, CircleAlert, Users, Mic } from 'lucide-react';
import { Group } from '../../types/chat.js';
import { getFileIcon, LIST_PREVIEW_ICON_SIZE } from '../../utils/fileIcons.js';
import { highlightText } from '../../utils/highlightText.js';
import { getContactCardSummary } from '../../features/chat/message/messageItemSupport.js';
import { systemPreviewText } from '../../features/chat/chatAreaSupport.js';
import { reactionPreviewText } from '../../features/chat/reactionPreview.js';
import { messageStatusIconKind, messageStatusIsRead } from '../../features/chat/messageStatusIcon.js';
import { formatMessageTime } from '../../utils/dateTime.js';
import { listRowAvatarSx } from './listRowMetrics.js';

export const formatGroupItemTime = (iso?: string | number | null) => formatMessageTime(iso);

export const GroupAvatar: React.FC<{ avatar?: string | null; size?: 'sm' | 'md' | 'lg' }> = ({ avatar, size = 'lg' }) => (
    <Avatar
        size={size}
        src={avatar || undefined}
        color="primary"
        variant="soft"
        sx={{
            ...(size === 'lg' ? listRowAvatarSx : {}),
            ...(!avatar ? { background: 'linear-gradient(135deg, var(--joy-palette-primary-500), var(--joy-palette-primary-700))' } : {}),
        }}
    >
        {!avatar && <Users style={{ fontSize: size === 'lg' ? 24 : 20, color: 'white' }} />}
    </Avatar>
);

export const GroupItemStatusIcon: React.FC<{ group: Group }> = ({ group }) => {
    if (group.latestReaction || !group.lastMessageIsMine || !group.lastMessage) {
        return null;
    }
    const kind = messageStatusIconKind(group.lastMessageStatus);
    if (kind === 'failed') {
        return <CircleAlert style={{ fontSize: 16, color: 'var(--joy-palette-danger-500)' }} />;
    }
    if (kind === 'sent') {
        return <Check style={{ fontSize: 16, opacity: 0.7 }} />;
    }
    const isRead = messageStatusIsRead(group.lastMessageStatus);
    return (
        <CheckCheck
            style={{
                fontSize: 16,
                color: isRead ? '#53bdeb' : 'inherit',
                opacity: isRead ? 1 : 0.7,
            }}
        />
    );
};

const renderGroupFilePreview = (fileName: string, mimeType: string) => (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        <Box component="span" sx={{ display: 'flex', opacity: 0.8 }}>
            {getFileIcon(mimeType, fileName, LIST_PREVIEW_ICON_SIZE)}
        </Box>
        <span>{fileName}</span>
    </Box>
);

export const renderGroupLastMessage = (group: Group, highlight: string) => {
    if (group.latestReaction) {
        const text = reactionPreviewText(group.latestReaction);
        return highlight ? highlightText(text, highlight) : text;
    }
    if (!group.lastMessage) {
        return `${group.members.length} miembro${group.members.length !== 1 ? 's' : ''}`;
    }
    const systemMessage = systemPreviewText(group.lastMessage);
    if (systemMessage) {
        return highlight ? highlightText(systemMessage, highlight) : systemMessage;
    }
    const contactCardSummary = getContactCardSummary(group.lastMessage);
    if (contactCardSummary) {
        return contactCardSummary;
    }
    if (group.lastMessage.startsWith('{') && group.lastMessage.endsWith('}')) {
        try {
            const parsed = JSON.parse(group.lastMessage);
            if (parsed.type === 'file') {
                if (parsed.isVoiceNote) {
                    return (
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            <Mic style={{ fontSize: LIST_PREVIEW_ICON_SIZE, opacity: 0.8 }} />
                            <span>Nota de voz</span>
                        </Box>
                    );
                }
                return renderGroupFilePreview(parsed.fileName || '', parsed.mimeType || '');
            }
            if (typeof parsed.text === 'string') {
                return parsed.text || '';
            }
        } catch (error) {
            console.error('[GroupItem] No se pudo parsear el último mensaje JSON', error);
        }
    }
    if (group.lastMessage.startsWith('FILE_TRANSFER|')) {
        const parts = group.lastMessage.split('|');
        if (parts.length >= 6) {
            return renderGroupFilePreview(parts[2] || '', parts[4] || '');
        }
    }
    return highlight ? highlightText(group.lastMessage, highlight) : group.lastMessage;
};