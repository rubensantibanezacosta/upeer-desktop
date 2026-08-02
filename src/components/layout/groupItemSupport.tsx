import React from 'react';
import { Avatar, Box } from '@mui/joy';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import GroupsIcon from '@mui/icons-material/Groups';
import MicIcon from '@mui/icons-material/Mic';
import { Group } from '../../types/chat.js';
import { getFileIcon } from '../../utils/fileIcons.js';
import { highlightText } from '../../utils/highlightText.js';
import { getContactCardSummary } from '../../features/chat/message/messageItemSupport.js';
import { formatMessageTime } from '../../utils/dateTime.js';

export const formatGroupItemTime = (iso?: string | number | null) => formatMessageTime(iso);

export const GroupAvatar: React.FC<{ avatar?: string | null; size?: 'sm' | 'md' | 'lg' }> = ({ avatar, size = 'lg' }) => (
    <Avatar
        size={size}
        src={avatar || undefined}
        color="primary"
        variant="soft"
        sx={{
            borderRadius: 'md',
            ...(!avatar ? { background: 'linear-gradient(135deg, var(--joy-palette-primary-500), var(--joy-palette-primary-700))' } : {}),
        }}
    >
        {!avatar && <GroupsIcon sx={{ fontSize: size === 'lg' ? 24 : 20, color: 'white' }} />}
    </Avatar>
);

export const GroupItemStatusIcon: React.FC<{ group: Group }> = ({ group }) => {
    if (!group.lastMessageIsMine || !group.lastMessage) {
        return null;
    }
    if (group.lastMessageStatus === 'failed') {
        return <ErrorOutlineIcon sx={{ fontSize: '16px', color: 'danger.500' }} />;
    }
    if (group.lastMessageStatus === 'sent' || group.lastMessageStatus === 'vaulted') {
        return <DoneIcon sx={{ fontSize: '16px', opacity: 0.7 }} />;
    }
    return (
        <DoneAllIcon
            sx={{
                fontSize: '16px',
                color: group.lastMessageStatus === 'read' ? '#53bdeb' : 'inherit',
                opacity: group.lastMessageStatus === 'read' ? 1 : 0.7,
            }}
        />
    );
};

const renderGroupFilePreview = (fileName: string, mimeType: string) => (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        <Box component="span" sx={{ display: 'flex', opacity: 0.8 }}>
            {getFileIcon(mimeType, fileName)}
        </Box>
        <span>{fileName}</span>
    </Box>
);

export const renderGroupLastMessage = (group: Group, highlight: string) => {
    if (!group.lastMessage) {
        return `${group.members.length} miembro${group.members.length !== 1 ? 's' : ''}`;
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
                            <MicIcon sx={{ fontSize: 16, opacity: 0.8 }} />
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