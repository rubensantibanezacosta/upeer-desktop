import React, { useState } from 'react';
import {
    Modal,
    ModalDialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Input,
    Box,
    Typography,
    Divider,
    Checkbox,
    Avatar,
    List,
    ListItem,
    Chip,
    Stack,
    IconButton
} from '@mui/joy';
import GroupsIcon from '@mui/icons-material/Groups';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { Contact } from '../../types/chat.js';

interface CreateGroupModalProps {
    open: boolean;
    onClose: () => void;
    contacts: Contact[];
    onCreate: (name: string, memberIds: string[]) => Promise<any>;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
    open,
    onClose,
    contacts,
    onCreate
}) => {
    const [groupName, setGroupName] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);

    const connectedContacts = contacts.filter(c => c.status === 'connected');
    const filtered = connectedContacts.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    const toggleMember = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleCreate = async () => {
        if (!groupName.trim() || selectedIds.length === 0) return;
        setLoading(true);
        try {
            await onCreate(groupName.trim(), selectedIds);
            handleClose();
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setGroupName('');
        setSelectedIds([]);
        setSearch('');
        onClose();
    };

    const selectedContacts = connectedContacts.filter(c => selectedIds.includes(c.upeerId));

    return (
        <Modal open={open} onClose={handleClose}>
            <ModalDialog
                sx={{
                    width: 480,
                    maxWidth: '95vw',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    borderRadius: 'xl',
                    boxShadow: 'lg',
                    p: 0
                }}
            >
                {/* Standardized Header */}
                <Box sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'background.surface'
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <GroupsIcon color="primary" />
                        <DialogTitle sx={{ m: 0 }}>Nuevo Grupo de Chat</DialogTitle>
                    </Box>
                    <IconButton variant="plain" color="neutral" size="sm" onClick={handleClose}>
                        <CloseIcon />
                    </IconButton>
                </Box>

                <Divider />

                <DialogContent sx={{ px: 3, pt: 2, pb: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <Typography level="body-sm">
                        Crea un grupo de chat seguro con tus contactos. Los mensajes serán cifrados de extremo a extremo para cada miembro.
                    </Typography>

                    {/* Group name input */}
                    <Stack spacing={1}>
                        <Typography level="body-xs" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8 }}>
                            Nombre del Grupo
                        </Typography>
                        <Input
                            autoFocus
                            placeholder="Ej: Equipo de Desarrollo, Amigos..."
                            value={groupName}
                            onChange={e => setGroupName(e.target.value)}
                            sx={{
                                backgroundColor: 'background.level1',
                                '&:focus-within': { backgroundColor: 'background.surface' }
                            }}
                        />
                    </Stack>

                    <Divider>Miembros ({selectedIds.length})</Divider>

                    {/* Selected members chips */}
                    {selectedContacts.length > 0 && (
                        <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ gap: 0.75 }}>
                            {selectedContacts.map(c => (
                                <Chip
                                    key={c.upeerId}
                                    variant="soft"
                                    color="primary"
                                    size="sm"
                                    onClick={() => toggleMember(c.upeerId)}
                                    endDecorator={<span style={{ cursor: 'pointer', opacity: 0.7 }}>×</span>}
                                >
                                    {c.name}
                                </Chip>
                            ))}
                        </Stack>
                    )}

                    {/* Contact search and list */}
                    <Stack spacing={1.5} sx={{ minHeight: 0, flexGrow: 1 }}>
                        <Input
                            placeholder="Buscar en tus contactos..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            startDecorator={<SearchIcon sx={{ opacity: 0.5, fontSize: '20px' }} />}
                            size="sm"
                            sx={{ borderRadius: 'md', mb: 0.5 }}
                        />

                        <Box sx={{
                            maxHeight: 200,
                            overflowY: 'auto',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 'md',
                            backgroundColor: 'background.level1',
                            '&::-webkit-scrollbar': { width: '6px' },
                            '&::-webkit-scrollbar-thumb': { borderRadius: '3px', bgcolor: 'divider' }
                        }}>
                            {connectedContacts.length === 0 ? (
                                <Box sx={{ p: 3, textAlign: 'center' }}>
                                    <Typography level="body-sm" color="neutral">No tienes contactos conectados</Typography>
                                </Box>
                            ) : filtered.length === 0 ? (
                                <Box sx={{ p: 3, textAlign: 'center' }}>
                                    <Typography level="body-sm" color="neutral">Sin resultados</Typography>
                                </Box>
                            ) : (
                                <List size="sm" sx={{ '--List-padding': '4px', gap: 0.25 }}>
                                    {filtered.map(c => {
                                        const isChecked = selectedIds.includes(c.upeerId);
                                        return (
                                            <ListItem
                                                key={c.upeerId}
                                                onClick={() => toggleMember(c.upeerId)}
                                                sx={{
                                                    borderRadius: 'sm',
                                                    cursor: 'pointer',
                                                    bgcolor: isChecked ? 'primary.softBg' : 'transparent',
                                                    '&:hover': { bgcolor: isChecked ? 'primary.softBg' : 'background.level3' },
                                                    py: 0.75,
                                                    px: 1
                                                }}
                                            >
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                                                    <Checkbox
                                                        checked={isChecked}
                                                        onChange={() => toggleMember(c.upeerId)}
                                                        size="sm"
                                                        color="primary"
                                                        onClick={e => e.stopPropagation()}
                                                    />
                                                    <Avatar size="sm" color="neutral" sx={{ borderRadius: 'md' }}>{c.name[0]}</Avatar>
                                                    <Typography level="body-sm" sx={{ fontWeight: 500 }}>{c.name}</Typography>
                                                </Box>
                                            </ListItem>
                                        );
                                    })}
                                </List>
                            )}
                        </Box>
                    </Stack>
                </DialogContent>

                <DialogActions sx={{ p: 3, pt: 1 }}>
                    <Button
                        type="submit"
                        variant="solid"
                        color="primary"
                        size="lg"
                        fullWidth
                        loading={loading}
                        disabled={!groupName.trim() || selectedIds.length === 0}
                        onClick={handleCreate}
                        sx={{ borderRadius: 'md', fontWeight: 600 }}
                    >
                        Crear Grupo Seguro
                    </Button>
                </DialogActions>
            </ModalDialog>
        </Modal>
    );
};
