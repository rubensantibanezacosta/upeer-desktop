import React, { useState } from 'react';
import { Box, Button, Checkbox, DialogActions, DialogContent, DialogTitle, Input, Modal, ModalDialog, Typography } from '@mui/joy';
import type { ChatList } from '../../../utils/chatLists.js';

export interface ListChatOption {
    id: string;
    name: string;
}

interface AddChatsToListDialogProps {
    list: ChatList;
    chats: ListChatOption[];
    onToggle: (chatId: string) => void;
    onClose: () => void;
}

export const AddChatsToListDialog: React.FC<AddChatsToListDialogProps> = ({ list, chats, onToggle, onClose }) => {
    const [query, setQuery] = useState('');
    const term = query.trim().toLowerCase();
    const visible = term ? chats.filter((chat) => chat.name.toLowerCase().includes(term)) : chats;

    return (
        <Modal open onClose={onClose}>
            <ModalDialog variant="outlined" sx={{ maxWidth: 420, borderRadius: 'md' }}>
                <DialogTitle>Chats en «{list.name}»</DialogTitle>
                <DialogContent>
                    <Input
                        placeholder="Buscar chat"
                        slotProps={{ input: { 'aria-label': 'Buscar chat para la lista' } }}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        sx={{ mb: 1 }}
                    />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 320, overflowY: 'auto' }}>
                        {visible.length === 0 && (
                            <Typography level="body-sm" sx={{ color: 'text.tertiary', py: 1 }}>
                                Sin chats que coincidan.
                            </Typography>
                        )}
                        {visible.map((chat) => (
                            <Box
                                key={chat.id}
                                component="label"
                                sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, py: 0.25, borderRadius: 'sm', cursor: 'pointer', '&:hover': { bgcolor: 'background.level1' } }}
                            >
                                <Checkbox
                                    checked={list.chatIds.includes(chat.id)}
                                    onChange={() => onToggle(chat.id)}
                                    slotProps={{ input: { 'aria-label': `Incluir ${chat.name} en la lista` } }}
                                />
                                <Typography level="body-sm">{chat.name}</Typography>
                            </Box>
                        ))}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button variant="solid" onClick={onClose}>
                        Hecho
                    </Button>
                </DialogActions>
            </ModalDialog>
        </Modal>
    );
};
