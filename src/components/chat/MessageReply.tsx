import React from 'react';
import { Box, Typography } from '@mui/joy';
import ReplyIcon from '@mui/icons-material/Reply';

interface MessageReplyProps {
    originalMessage?: string;
    isMe: boolean;
    onClick: () => void;
}

export const MessageReply: React.FC<MessageReplyProps> = ({ originalMessage, isMe, onClick }) => (
    <Box sx={{
        mb: 1,
        p: 1,
        borderRadius: 'lg',
        backgroundColor: isMe ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
        borderLeft: '4px solid',
        borderColor: isMe ? 'white' : 'primary.500',
        cursor: 'pointer'
    }} onClick={onClick}>
        <Typography level="body-xs" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <ReplyIcon sx={{ fontSize: '14px' }} /> Respuesta a:
        </Typography>
        <Typography level="body-sm" noWrap sx={{ opacity: 0.8 }}>
            {originalMessage || 'Mensaje original'}
        </Typography>
    </Box>
);
