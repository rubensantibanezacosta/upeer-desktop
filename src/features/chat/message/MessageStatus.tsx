import React from 'react';
import { Box } from '@mui/joy';
import { IconButton } from '@mui/joy';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ReplayIcon from '@mui/icons-material/Replay';

interface MessageStatusProps {
    status: string;
    onRetry?: () => void;
}

export const MessageStatus: React.FC<MessageStatusProps> = ({ status, onRetry }) => {
    if (status === 'failed') {
        return (
            <IconButton
                aria-label="Reintentar mensaje"
                size="sm"
                variant="plain"
                color="danger"
                onClick={(event) => {
                    event.stopPropagation();
                    onRetry?.();
                }}
                sx={{ '--IconButton-size': '18px', minHeight: 0, minWidth: 0, p: 0, opacity: 0.9 }}
            >
                <ReplayIcon sx={{ fontSize: '14px' }} />
            </IconButton>
        );
    }

    const isRead = status === 'read';
    const isSingleCheck = status === 'sent' || status === 'vaulted';
    const Icon = isSingleCheck ? DoneIcon : DoneAllIcon;
    const readableStatus = isRead ? 'leído' : isSingleCheck ? 'enviado' : 'entregado';
    return (
        <Box component="span" aria-label={`Estado del mensaje: ${readableStatus}`} sx={{ display: 'inline-flex', alignItems: 'center' }}>
            <Icon sx={{
                fontSize: '16px',
                lineHeight: 1,
                flexShrink: 0,
                color: isRead ? '#53bdeb' : 'text.tertiary',
                opacity: isRead ? 1 : 0.7,
                verticalAlign: 'middle',
            }} />
        </Box>
    );
};

