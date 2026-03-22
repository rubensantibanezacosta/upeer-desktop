import React from 'react';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';

interface MessageStatusProps {
    status: string;
}

export const MessageStatus: React.FC<MessageStatusProps> = ({ status }) => {
    const isRead = status === 'read';
    const isSingleCheck = status === 'sent' || status === 'vaulted';
    const Icon = isSingleCheck ? DoneIcon : DoneAllIcon;
    return (
        <Icon sx={{
            fontSize: '16px',
            lineHeight: 1,
            flexShrink: 0,
            color: isRead ? '#53bdeb' : 'text.tertiary',
            opacity: isRead ? 1 : 0.7,
            verticalAlign: 'middle',
        }} />
    );
};

