import React from 'react';
import { Box, Typography } from '@mui/joy';
import ReplyIcon from '@mui/icons-material/Reply';
import { getFileIcon } from '../../../utils/fileIcons.js';

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
            {(() => {
                if (!originalMessage) return 'Mensaje original';
                const m = originalMessage;
                if (m.startsWith('CONTACT_CARD|')) return 'Tarjeta de contacto';
                if (m.startsWith('{') && m.endsWith('}')) {
                    try {
                        const parsed = JSON.parse(m);
                        if (parsed.type === 'file') {
                            return (
                                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                    <Box component="span" sx={{ display: 'flex', opacity: 0.8 }}>
                                        {getFileIcon(parsed.mimeType || '', parsed.fileName || '')}
                                    </Box>
                                    <span>{parsed.fileName}</span>
                                </Box>
                            );
                        }
                    } catch (_) { }
                }
                if (m.startsWith('FILE_TRANSFER|')) {
                    const parts = m.split('|');
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
                return m;
            })()}
        </Typography>
    </Box>
);
