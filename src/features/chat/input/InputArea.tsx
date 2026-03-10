import React from 'react';
import {
    Box,
    Input,
    IconButton,
    Typography
} from '@mui/joy';
import SendIcon from '@mui/icons-material/Send';
import MoodIcon from '@mui/icons-material/Mood';
import MicIcon from '@mui/icons-material/Mic';
import EditIcon from '@mui/icons-material/Edit';

import CloseIcon from '@mui/icons-material/Close';
import ReplyIcon from '@mui/icons-material/Reply';
import { AttachmentButton, AttachmentType } from './AttachmentButton.js';
import { getFileIcon } from '../../../utils/fileIcons.js';

interface InputAreaProps {
    message: string;
    setMessage: (msg: string) => void;
    onSend: () => void;
    onTyping?: () => void;
    disabled: boolean;
    replyToMessage?: { id?: string; message: string; isMine: boolean } | null;
    onCancelReply?: () => void;
    editingMessage?: { id?: string; message: string } | null;
    onCancelEdit?: () => void;

    onAttachFile?: (type: AttachmentType) => void;
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
    onAttachFile
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
                <Box sx={{
                    p: 1, px: 2, display: 'flex', alignItems: 'center', gap: 1.5,
                    backgroundColor: 'background.level1', borderLeft: '4px solid',
                    borderColor: 'primary.main', mx: 2, mt: 1, borderRadius: '4px',
                }}>
                    <ReplyIcon sx={{ fontSize: '18px', color: 'primary.main' }} />
                    <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                        <Typography level="body-xs" sx={{ fontWeight: 600, color: 'primary.main' }}>
                            {replyToMessage.isMine ? 'Tú' : 'Contacto'}
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
                <IconButton variant="plain" color="neutral"><MoodIcon /></IconButton>
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
