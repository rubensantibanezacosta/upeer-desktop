import React, { useState } from 'react';
import { Box, Button, IconButton, List, ListItem, Typography } from '@mui/joy';
import { ArrowLeft, ListPlus, Pencil, Play, Trash2, UserPlus } from 'lucide-react';
import { useChatListsStore } from '../../../store/useChatListsStore.js';
import { AddChatsToListDialog, type ListChatOption } from './AddChatsToListDialog.js';
import { ListNameDialog } from './ListNameDialog.js';
import type { ChatList } from '../../../utils/chatLists.js';

interface ListsPanelProps {
    chats: ListChatOption[];
    onApply: (listId: string) => void;
    onBack: () => void;
}

interface DialogState {
    mode: 'create' | 'rename';
    listId?: string;
    initialValue?: string;
}

export const ListsPanel: React.FC<ListsPanelProps> = ({ chats, onApply, onBack }) => {
    const lists = useChatListsStore((state) => state.lists);
    const createList = useChatListsStore((state) => state.createList);
    const renameList = useChatListsStore((state) => state.renameList);
    const deleteList = useChatListsStore((state) => state.deleteList);
    const toggleChat = useChatListsStore((state) => state.toggleChat);

    const [dialog, setDialog] = useState<DialogState | null>(null);
    const [editingChats, setEditingChats] = useState<ChatList | null>(null);

    const submitName = (name: string) => {
        if (!dialog) return;
        if (dialog.mode === 'create') {
            createList(name);
        } else if (dialog.listId) {
            renameList(dialog.listId, name);
        }
        setDialog(null);
    };

    const activeChats = editingChats ? lists.find((list) => list.id === editingChats.id) ?? editingChats : null;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
            <Box sx={{ height: '60px', px: 2, display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                <IconButton aria-label="Volver a los chats" size="sm" variant="plain" color="neutral" onClick={onBack}>
                    <ArrowLeft style={{ fontSize: 20 }} />
                </IconButton>
                <Typography level="title-md" sx={{ fontWeight: 600, flexGrow: 1 }}>Listas</Typography>
                <Button
                    size="sm"
                    variant="soft"
                    startDecorator={<ListPlus style={{ fontSize: 16 }} />}
                    onClick={() => setDialog({ mode: 'create' })}
                >
                    Crear
                </Button>
            </Box>

            {lists.length === 0 ? (
                <Box sx={{ px: 2, py: 3 }}>
                    <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                        Una lista agrupa los chats que tú elijas, como «Trabajo» o «Familia». Solo cambia cómo los ves, no a quién llegan los mensajes.
                    </Typography>
                </Box>
            ) : (
                <Box sx={{ flexGrow: 1, overflowY: 'auto', minWidth: 0 }}>
                    <List sx={{ py: 0 }}>
                        {lists.map((list) => (
                            <ListItem key={list.id} sx={{ px: 2, py: 1, gap: 1, alignItems: 'flex-start' }}>
                                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                    <Typography level="body-md" sx={{ fontWeight: 600 }}>{list.name}</Typography>
                                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                        {list.chatIds.length === 1 ? '1 chat' : `${list.chatIds.length} chats`}
                                    </Typography>
                                </Box>
                                <IconButton
                                    size="sm"
                                    variant="plain"
                                    color="neutral"
                                    aria-label={`Ver la lista ${list.name}`}
                                    onClick={() => onApply(list.id)}
                                >
                                    <Play style={{ fontSize: 16 }} />
                                </IconButton>
                                <IconButton
                                    size="sm"
                                    variant="plain"
                                    color="neutral"
                                    aria-label={`Elegir chats de ${list.name}`}
                                    onClick={() => setEditingChats(list)}
                                >
                                    <UserPlus style={{ fontSize: 16 }} />
                                </IconButton>
                                <IconButton
                                    size="sm"
                                    variant="plain"
                                    color="neutral"
                                    aria-label={`Renombrar la lista ${list.name}`}
                                    onClick={() => setDialog({ mode: 'rename', listId: list.id, initialValue: list.name })}
                                >
                                    <Pencil style={{ fontSize: 16 }} />
                                </IconButton>
                                <IconButton
                                    size="sm"
                                    variant="plain"
                                    color="danger"
                                    aria-label={`Eliminar la lista ${list.name}`}
                                    onClick={() => deleteList(list.id)}
                                >
                                    <Trash2 style={{ fontSize: 16 }} />
                                </IconButton>
                            </ListItem>
                        ))}
                    </List>
                </Box>
            )}

            {dialog && (
                <ListNameDialog
                    key={`${dialog.mode}-${dialog.listId ?? 'new'}`}
                    open
                    title={dialog.mode === 'create' ? 'Nueva lista' : 'Renombrar lista'}
                    confirmLabel={dialog.mode === 'create' ? 'Crear' : 'Guardar'}
                    initialValue={dialog.initialValue}
                    onCancel={() => setDialog(null)}
                    onConfirm={submitName}
                />
            )}

            {activeChats && (
                <AddChatsToListDialog
                    list={activeChats}
                    chats={chats}
                    onToggle={(chatId) => toggleChat(activeChats.id, chatId)}
                    onClose={() => setEditingChats(null)}
                />
            )}
        </Box>
    );
};
