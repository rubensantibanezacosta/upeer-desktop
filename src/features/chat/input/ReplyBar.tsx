import React from 'react';
import { Box, IconButton, Typography } from '@mui/joy';
import CloseIcon from '@mui/icons-material/Close';
import { getFileIcon } from '../../../utils/fileIcons.js';
import { toMediaUrl } from '../../../utils/fileUtils.js';

interface ReplyBarProps {
    replyToMessage: { id?: string; message: string; isMine: boolean; senderName?: string };
    onCancel: () => void;
    onScrollTo?: (msgId: string) => void;
}

export const ReplyBar: React.FC<ReplyBarProps> = ({ replyToMessage, onCancel, onScrollTo }) => {
    const m = replyToMessage.message;

    let thumbnail = '';
    if (m.startsWith('{') && m.endsWith('}')) {
        try {
            const parsed = JSON.parse(m);
            if (parsed.type === 'file' && !parsed.isVoiceNote && (parsed.mimeType?.startsWith('image/') || parsed.mimeType?.startsWith('video/'))) {
                thumbnail = parsed.thumbnail;
            }
        } catch { /* ignore */ }
    } else if (m.startsWith('FILE_TRANSFER|')) {
        const parts = m.split('|');
        if (parts.length >= 7 && (parts[4]?.startsWith('image/') || parts[4]?.startsWith('video/'))) {
            thumbnail = parts[6] !== 'undefined' ? parts[6] : '';
        }
    }

    const previewText = (() => {
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
            } catch { /* ignore */ }
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
        if (m.startsWith('{') && m.endsWith('}')) {
            try {
                const parsed = JSON.parse(m);
                if (typeof parsed.text === 'string') return parsed.text;
            } catch { /* ignore */ }
        }
        return m;
    })();

    return (
        <Box
            onClick={() => replyToMessage.id && onScrollTo?.(replyToMessage.id)}
            sx={{
                p: 1, px: 2, display: 'flex', alignItems: 'center', gap: 1.5,
                backgroundColor: 'background.level1', borderLeft: '4px solid',
                borderColor: 'primary.main', mx: 2, mt: 1, borderRadius: '4px',
                position: 'relative', overflow: 'hidden',
                cursor: replyToMessage.id ? 'pointer' : 'default',
                '&:hover': replyToMessage.id ? { backgroundColor: 'background.level2' } : {}
            }}
        >
            <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', gap: 1.5, alignItems: 'center' }}>
                {thumbnail && (
                    <Box sx={{
                        width: 40, height: 40, borderRadius: '4px', overflow: 'hidden', flexShrink: 0,
                        backgroundColor: 'background.level2', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <img
                            src={thumbnail.startsWith('data:') ? thumbnail : toMediaUrl(thumbnail)}
                            alt="preview"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    </Box>
                )}
                <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                    <Typography level="body-xs" sx={{ fontWeight: 600, color: 'primary.main' }}>
                        {replyToMessage.isMine ? 'Tú' : (replyToMessage.senderName || 'Contacto')}
                    </Typography>
                    <Typography level="body-sm" noWrap sx={{ opacity: 0.8 }}>
                        {previewText}
                    </Typography>
                </Box>
            </Box>
            <IconButton
                size="sm"
                variant="plain"
                color="neutral"
                onClick={(e) => {
                    e.stopPropagation();
                    onCancel();
                }}
            >
                <CloseIcon sx={{ fontSize: '18px' }} />
            </IconButton>
        </Box>
    );
};
