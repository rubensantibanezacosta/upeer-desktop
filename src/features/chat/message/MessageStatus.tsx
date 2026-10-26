import React from 'react';
import { Box } from '@mui/joy';
import { IconButton } from '@mui/joy';
import { Check, CheckCheck, RotateCcw, CloudUpload } from 'lucide-react';
import { useChatStore } from '../../../store/useChatStore.js';

interface MessageStatusProps {
    status: string;
    messageId?: string;
    onRetry?: () => void;
}

export const MessageStatus: React.FC<MessageStatusProps> = ({ status, messageId, onRetry }) => {
    const syncPending = useChatStore((state) => (
        Boolean(messageId) && state.syncStatus.pendingEntityIds.includes(messageId as string)
    ));
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
                <RotateCcw style={{ fontSize: 14 }} />
            </IconButton>
        );
    }

    const isRead = status === 'read';
    const isSingleCheck = status === 'sent' || status === 'vaulted';
    const Icon = isSingleCheck ? Check : CheckCheck;
    const readableStatus = isRead ? 'leído' : isSingleCheck ? 'enviado' : 'entregado';
    return (
        <Box component="span" aria-label={`Estado del mensaje: ${readableStatus}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
            {syncPending && (
                <CloudUpload
                    aria-label="Pendiente de sincronizar con tus dispositivos"
                    style={{ fontSize: 13, opacity: 0.7, verticalAlign: 'middle' }}
                />
            )}
            <Icon style={{
                fontSize: 16,
                flexShrink: 0,
                color: isRead ? '#53bdeb' : 'var(--joy-palette-text-tertiary)',
                opacity: isRead ? 1 : 0.7,
                verticalAlign: 'middle',
            }} />
        </Box>
    );
};

