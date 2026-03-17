import React from 'react';
import { Box, Typography } from '@mui/joy';
import ReplyIcon from '@mui/icons-material/Reply';
import { getFileIcon } from '../../../utils/fileIcons.js';

interface MessageReplyProps {
    originalMessage?: string;
    originalSenderName?: string;
    isMe: boolean;
    onClick: () => void;
}

export const MessageReply: React.FC<MessageReplyProps> = ({ originalMessage, originalSenderName, isMe, onClick }) => (
    <Box sx={{
        mb: 0.5,
        p: 1,
        borderRadius: '8px',
        backgroundColor: isMe ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
        backdropFilter: 'blur(10px)',
        borderLeft: '3px solid',
        borderColor: isMe ? 'rgba(255,255,255,0.25)' : 'primary.400',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        '&:hover': {
            backgroundColor: isMe ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.06)',
        },
        minWidth: '100px',
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 0
    }} onClick={onClick}>
        {originalSenderName && (
            <Typography 
                level="body-xs" 
                sx={{ 
                    fontWeight: 700, 
                    fontSize: '11px',
                    color: isMe ? 'rgba(255,255,255,0.85)' : 'primary.600',
                    lineHeight: 1.2,
                    mb: 0.25
                }}
            >
                {originalSenderName === 'Tú' ? 'Tú' : originalSenderName}
            </Typography>
        )}
        <Typography 
            level="body-sm" 
            noWrap 
            sx={{ 
                opacity: 0.85,
                fontSize: '12.5px',
                color: isMe ? 'rgba(255,255,255,0.9)' : 'text.secondary',
                lineHeight: 1.4,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 0.75
            }}
        >
            {(() => {
                if (!originalMessage) return 'Mensaje original';
                const m = originalMessage;
                if (m.startsWith('CONTACT_CARD|')) return 'Tarjeta de contacto';
                if (m.startsWith('{') && m.endsWith('}')) {
                    try {
                        const parsed = JSON.parse(m);
                        if (parsed.type === 'file') {
                            return (
                                <>
                                    <Box component="span" sx={{ display: 'flex', opacity: 0.8 }}>
                                        {getFileIcon(parsed.mimeType || '', parsed.fileName || '')}
                                    </Box>
                                    <span>{parsed.fileName}</span>
                                </>
                            );
                        }
                    } catch (_) { }
                }
                if (m.startsWith('FILE_TRANSFER|')) {
                    const parts = m.split('|');
                    if (parts.length >= 6) {
                        return (
                            <>
                                <Box component="span" sx={{ display: 'flex', opacity: 0.8 }}>
                                    {getFileIcon(parts[4] || '', parts[2] || '')}
                                </Box>
                                <span>{parts[2]}</span>
                            </>
                        );
                    }
                }
                return m;
            })()}
        </Typography>
    </Box>
);
