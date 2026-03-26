import React from 'react';
import { Box, Typography } from '@mui/joy';

export const formatChatDateLabel = (date: number) => {
    const currentDate = new Date(date);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (currentDate.toDateString() === now.toDateString()) {
        return 'Hoy';
    }
    if (currentDate.toDateString() === yesterday.toDateString()) {
        return 'Ayer';
    }
    if (currentDate.getFullYear() === now.getFullYear()) {
        return currentDate.toLocaleDateString([], { day: '2-digit', month: 'long' });
    }
    return currentDate.toLocaleDateString([], { day: '2-digit', month: 'long', year: 'numeric' });
};

export const highlightChatMessage = (messageId: string) => {
    const element = document.getElementById(`msg-${messageId}`);
    if (!element) {
        return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const sheet = element.querySelector('.MuiSheet-root');
    if (!sheet) {
        return;
    }
    sheet.classList.remove('highlight-message-active');
    void (sheet as HTMLElement).offsetWidth;
    sheet.classList.add('highlight-message-active');
};

interface ChatSystemMessageProps {
    message: string;
}

export const ChatSystemMessage: React.FC<ChatSystemMessageProps> = ({ message }) => (
    <Box sx={{ display: 'flex', justifyContent: 'center', my: 0.5 }}>
        <Typography
            level="body-xs"
            sx={{
                px: 1.5,
                py: 0.4,
                borderRadius: 'xl',
                backgroundColor: 'background.level2',
                color: 'text.tertiary',
                fontStyle: 'italic',
                userSelect: 'none',
            }}
        >
            {message}
        </Typography>
    </Box>
);

interface ChatDateSeparatorProps {
    date: number;
}

export const ChatDateSeparator: React.FC<ChatDateSeparatorProps> = ({ date }) => (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, mb: 1 }}>
        <Box sx={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
            <Typography
                level="body-xs"
                sx={{
                    px: 2,
                    py: 0.5,
                    borderRadius: 'lg',
                    backgroundColor: 'background.level1',
                    color: 'text.secondary',
                    fontWeight: 600,
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    zIndex: 1,
                }}
            >
                {formatChatDateLabel(date)}
            </Typography>
            <Box
                sx={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    right: 0,
                    height: '1px',
                    backgroundColor: 'divider',
                    zIndex: 0,
                }}
            />
        </Box>
    </Box>
);