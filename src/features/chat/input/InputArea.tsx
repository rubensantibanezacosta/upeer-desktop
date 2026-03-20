import React from 'react';
import {
    Box,
    Input,
    IconButton,
    Typography
} from '@mui/joy';
import SendIcon from '@mui/icons-material/Send';
import MicIcon from '@mui/icons-material/Mic';
import EditIcon from '@mui/icons-material/Edit';

import CloseIcon from '@mui/icons-material/Close';
import { AttachmentButton, AttachmentType } from './AttachmentButton.js';
import { EmojiPicker } from './EmojiPicker.js';
import { getFileIcon } from '../../../utils/fileIcons.js';

interface InputAreaProps {
    message: string;
    setMessage: (msg: string) => void;
    onSend: () => void;
    onTyping?: () => void;
    disabled: boolean;
    replyToMessage?: { id?: string; message: string; isMine: boolean; senderName?: string } | null;
    onCancelReply?: () => void;
    editingMessage?: { id?: string; message: string } | null;
    onCancelEdit?: () => void;

    onAttachFile?: (type: AttachmentType) => void;
    onScrollToMessage?: (msgId: string) => void;
}

export const InputArea: React.FC<InputAreaProps> = ({
    message,
    setMessage,
    onSend,
    onTyping,
    disabled,
    replyToMessage,
    onCancelReply,
    editingMessage,
    onCancelEdit,
    onAttachFile,
    onScrollToMessage
}) => {

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMessage(e.target.value);
        if (onTyping) onTyping();
    };

    return (
        <Box sx={{
            borderTop: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.surface',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            boxSizing: 'border-box'
        }}>
            {replyToMessage && (
                <Box
                    onClick={() => replyToMessage?.id && onScrollToMessage?.(replyToMessage.id)}
                    sx={{
                        p: 1, px: 2, display: 'flex', alignItems: 'center', gap: 1.5,
                        backgroundColor: 'background.level1', borderLeft: '4px solid',
                        borderColor: 'primary.main', mx: 2, mt: 1, borderRadius: '4px',
                        position: 'relative', overflow: 'hidden',
                        cursor: replyToMessage?.id ? 'pointer' : 'default',
                        '&:hover': replyToMessage?.id ? { backgroundColor: 'background.level2' } : {}
                    }}
                >
                    <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', gap: 1.5, alignItems: 'center' }}>
                        {(() => {
                            const m = replyToMessage.message;
                            let thumbnail = '';
                            if (m.startsWith('{') && m.endsWith('}')) {
                                try {
                                    const parsed = JSON.parse(m);
                                    if (parsed.type === 'file' && (parsed.mimeType?.startsWith('image/') || parsed.mimeType?.startsWith('video/'))) {
                                        thumbnail = parsed.thumbnail;
                                    }
                                } catch (_err) { /* ignore */ }
                            } else if (m.startsWith('FILE_TRANSFER|')) {
                                const parts = m.split('|');
                                if (parts.length >= 7 && (parts[4]?.startsWith('image/') || parts[4]?.startsWith('video/'))) {
                                    thumbnail = parts[6] !== 'undefined' ? parts[6] : '';
                                }
                            }

                            if (thumbnail) {
                                return (
                                    <Box
                                        sx={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: '4px',
                                            overflow: 'hidden',
                                            flexShrink: 0,
                                            backgroundColor: 'background.level2',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <img
                                            src={thumbnail.startsWith('data:') ? thumbnail : `media://${thumbnail}`}
                                            alt="preview"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    </Box>
                                );
                            }
                            return null;
                        })()}
                        <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                            <Typography level="body-xs" sx={{ fontWeight: 600, color: 'primary.main' }}>
                                {replyToMessage.isMine ? 'Tú' : (replyToMessage.senderName || 'Contacto')}
                            </Typography>
                            <Typography level="body-sm" noWrap sx={{ opacity: 0.8 }}>
                                {(() => {
                                    const m = replyToMessage.message;
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
                                        } catch (_err) { /* ignore */ }
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
                    </Box>
                    <IconButton size="sm" variant="plain" color="neutral" onClick={onCancelReply}>
                        <CloseIcon sx={{ fontSize: '18px' }} />
                    </IconButton>
                </Box>
            )}

            {editingMessage && (
                <Box sx={{
                    p: 1, px: 2, display: 'flex', alignItems: 'center', gap: 1.5,
                    backgroundColor: 'background.level1', borderLeft: '4px solid',
                    borderColor: 'warning.main', mx: 2, mt: 1, borderRadius: '4px',
                }}>
                    <EditIcon sx={{ fontSize: '18px', color: 'warning.main' }} />
                    <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                        <Typography level="body-xs" sx={{ fontWeight: 600, color: 'warning.main' }}>
                            Editando mensaje
                        </Typography>
                        <Typography level="body-sm" noWrap sx={{ opacity: 0.8 }}>
                            {editingMessage.message}
                        </Typography>
                    </Box>
                    <IconButton size="sm" variant="plain" color="neutral" onClick={onCancelEdit}>
                        <CloseIcon sx={{ fontSize: '18px' }} />
                    </IconButton>
                </Box>
            )}

            <Box sx={{
                px: 2,
                py: 1,
                display: 'flex',
                gap: 1.5,
                alignItems: 'center',
                height: '62px',
                boxSizing: 'border-box'
            }}>
                <EmojiPicker
                    onSelect={(emoji) => setMessage(message + emoji)}
                    disabled={disabled}
                />
                <AttachmentButton
                    onSelect={(type) => {
                        if (onAttachFile) onAttachFile(type);
                    }}
                    disabled={disabled}
                />
                <Input
                    placeholder={editingMessage ? "Edita tu mensaje..." : "Escribe un mensaje..."}
                    value={message}
                    onChange={handleChange}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
                    sx={{
                        flexGrow: 1,
                        borderRadius: '8px',
                        '--Input-focusedThickness': '0px',
                        backgroundColor: 'background.level1',
                        border: 'none',
                        px: 2
                    }}
                    variant="plain"
                    autoComplete="off"
                    disabled={disabled}
                />
                <IconButton
                    variant="plain"
                    color="neutral"
                    onClick={message ? onSend : undefined}
                    disabled={disabled}
                >
                    {message ? (
                        editingMessage ? <SendIcon color="warning" /> : <SendIcon color="primary" />
                    ) : (
                        <MicIcon />
                    )}
                </IconButton>
            </Box>
        </Box>
    );
};
