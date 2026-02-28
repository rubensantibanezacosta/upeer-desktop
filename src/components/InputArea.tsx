import React from 'react';
import {
    Box,
    Input,
    IconButton,
    Typography
} from '@mui/joy';
import SendIcon from '@mui/icons-material/Send';
import AddIcon from '@mui/icons-material/Add';
import MoodIcon from '@mui/icons-material/Mood';
import MicIcon from '@mui/icons-material/Mic';

import CloseIcon from '@mui/icons-material/Close';
import ReplyIcon from '@mui/icons-material/Reply';

interface InputAreaProps {
    message: string;
    setMessage: (msg: string) => void;
    onSend: () => void;
    onTyping?: () => void;
    disabled: boolean;
    replyToMessage?: { id?: string; message: string; isMine: boolean } | null;
    onCancelReply?: () => void;
}

export const InputArea: React.FC<InputAreaProps> = ({
    message,
    setMessage,
    onSend,
    onTyping,
    disabled,
    replyToMessage,
    onCancelReply
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
            flexDirection: 'column'
        }}>
            {replyToMessage && (
                <Box sx={{
                    p: 1,
                    px: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    backgroundColor: 'background.level1',
                    borderLeft: '4px solid',
                    borderColor: 'primary.main',
                    mx: 2,
                    mt: 1,
                    borderRadius: '4px',
                }}>
                    <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                        <Typography level="body-xs" sx={{ fontWeight: 600, color: 'primary.main' }}>
                            {replyToMessage.isMine ? 'Tú' : 'Contacto'}
                        </Typography>
                        <Typography level="body-sm" noWrap sx={{ opacity: 0.8 }}>
                            {replyToMessage.message}
                        </Typography>
                    </Box>
                    <IconButton size="sm" variant="plain" color="neutral" onClick={onCancelReply}>
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
                <IconButton variant="plain" color="neutral"><AddIcon /></IconButton>
                <Input
                    placeholder="Escribe un mensaje"
                    value={message}
                    onChange={handleChange}
                    onKeyPress={(e) => e.key === 'Enter' && onSend()}
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
                    {message ? <SendIcon color="primary" /> : <MicIcon />}
                </IconButton>
            </Box>
        </Box>
    );
};
