import React from 'react';
import { Box, Button, DialogContent, DialogTitle, Divider, Modal, ModalDialog, Typography } from '@mui/joy';
import { Check, Palette } from 'lucide-react';
import { CHAT_STYLE_PRESETS, chatStyleSx, resolveChatStyleId } from './chatStyle.js';
import type { ChatStyleId } from './chatStyle.js';

interface ChatStylePickerProps {
    open: boolean;
    value?: ChatStyleId | string | null;
    onSelect: (id: ChatStyleId) => void;
    onClose: () => void;
}

export const ChatStylePicker: React.FC<ChatStylePickerProps> = ({ open, value, onSelect, onClose }) => {
    const current = resolveChatStyleId(value);

    return (
        <Modal open={open} onClose={onClose}>
            <ModalDialog variant="outlined" sx={{ maxWidth: 460, borderRadius: 'md' }}>
                <DialogTitle>
                    <Palette style={{ fontSize: 20 }} />
                    Estilo del chat
                </DialogTitle>
                <Divider />
                <DialogContent>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1.5 }}>
                        Solo cambia el fondo de esta conversación.
                    </Typography>
                    <Box
                        role="radiogroup"
                        aria-label="Estilo del chat"
                        sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25 }}
                    >
                        {CHAT_STYLE_PRESETS.map((preset) => {
                            const selected = preset.id === current;

                            return (
                                <Button
                                    key={preset.id}
                                    role="radio"
                                    aria-checked={selected}
                                    data-chat-style-option={preset.id}
                                    variant="plain"
                                    color="neutral"
                                    onClick={() => onSelect(preset.id)}
                                    sx={{
                                        flexDirection: 'column',
                                        alignItems: 'stretch',
                                        gap: 0.75,
                                        p: 0.75,
                                        height: 'auto',
                                        borderRadius: 'sm',
                                        bgcolor: 'background.body',
                                        border: '1px solid',
                                        borderColor: selected ? 'primary.500' : 'divider',
                                        '&:hover': { bgcolor: 'background.level1' },
                                    }}
                                >
                                    <Box
                                        data-chat-style-swatch={preset.id}
                                        sx={[
                                            {
                                                position: 'relative',
                                                height: 64,
                                                borderRadius: 'xs',
                                                border: '1px solid',
                                                borderColor: 'divider',
                                                backgroundColor: 'background.body',
                                                display: 'flex',
                                                alignItems: 'flex-end',
                                                justifyContent: 'flex-end',
                                                p: 0.5,
                                            },
                                            chatStyleSx(preset.id),
                                        ]}
                                    >
                                        {selected && <Check style={{ fontSize: 16 }} />}
                                    </Box>
                                    <Box sx={{ textAlign: 'left' }}>
                                        <Typography level="body-sm" sx={{ fontWeight: 600 }}>{preset.label}</Typography>
                                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>{preset.description}</Typography>
                                    </Box>
                                </Button>
                            );
                        })}
                    </Box>
                </DialogContent>
            </ModalDialog>
        </Modal>
    );
};
