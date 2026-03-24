import React, { useMemo, useState } from 'react';
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
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import { Contact, Group } from '../../types/chat.js';

interface InviteGroupMembersModalProps {
    open: boolean;
    onClose: () => void;
    contacts: Contact[];
    group: Group | null;
    onInvite: (groupId: string, memberIds: string[]) => Promise<void>;
}

export const InviteGroupMembersModal: React.FC<InviteGroupMembersModalProps> = ({
    open,
    onClose,
    contacts,
    group,
    onInvite
}) => {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);

    const availableContacts = useMemo(() => {
        const currentMembers = new Set(group?.members ?? []);
        return contacts.filter((contact) => (
            !contact.isConversationOnly &&
            contact.status !== 'blocked' &&
            contact.status !== 'incoming' &&
            contact.status !== 'pending' &&
            !currentMembers.has(contact.upeerId)
        ));
    }, [contacts, group]);

    const filteredContacts = useMemo(() => {
        const normalized = search.trim().toLowerCase();
        if (!normalized) return availableContacts;
        return availableContacts.filter((contact) => (
            contact.name.toLowerCase().includes(normalized) ||
            contact.upeerId.toLowerCase().includes(normalized)
        ));
    }, [availableContacts, search]);

    const selectedContacts = useMemo(() => (
        availableContacts.filter((contact) => selectedIds.includes(contact.upeerId))
    ), [availableContacts, selectedIds]);

    const toggleMember = (id: string) => {
        setSelectedIds((current) => (
            current.includes(id)
                ? current.filter((value) => value !== id)
                : [...current, id]
        ));
    };

    const handleClose = () => {
        setSelectedIds([]);
        setSearch('');
        onClose();
    };

    const handleInvite = async () => {
        if (!group?.groupId || selectedIds.length === 0) return;
        setLoading(true);
        try {
            await onInvite(group.groupId, selectedIds);
            handleClose();
        } finally {
            setLoading(false);
        }
    };

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
                <Box sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'background.surface'
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonAddAlt1Icon color="primary" />
                        <DialogTitle sx={{ m: 0 }}>Añadir miembros</DialogTitle>
                    </Box>
                    <IconButton variant="plain" color="neutral" size="sm" onClick={handleClose}>
                        <CloseIcon />
                    </IconButton>
                </Box>

                <Divider />

                <DialogContent sx={{ px: 3, pt: 2, pb: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <Typography level="body-sm">
                        {group
                            ? `Selecciona contactos para añadir a ${group.name}. La app rotará la clave del grupo y distribuirá la nueva epoch al confirmar.`
                            : 'Selecciona contactos para añadir al grupo.'}
                    </Typography>

                    <Divider>Miembros nuevos ({selectedIds.length})</Divider>

                    {selectedContacts.length > 0 && (
                        <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ gap: 0.75 }}>
                            {selectedContacts.map((contact) => (
                                <Chip
                                    key={contact.upeerId}
                                    variant="soft"
                                    color="primary"
                                    size="sm"
                                    onClick={() => toggleMember(contact.upeerId)}
                                    endDecorator={<span style={{ cursor: 'pointer', opacity: 0.7 }}>×</span>}
                                >
                                    {contact.name}
                                </Chip>
                            ))}
                        </Stack>
                    )}

                    <Stack spacing={1.5} sx={{ minHeight: 0, flexGrow: 1 }}>
                        <Input
                            placeholder="Buscar en tus contactos..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            startDecorator={<SearchIcon sx={{ opacity: 0.5, fontSize: '20px' }} />}
                            size="sm"
                            sx={{ borderRadius: 'md', mb: 0.5 }}
                        />

                        <Box sx={{
                            maxHeight: 260,
                            overflowY: 'auto',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 'md',
                            backgroundColor: 'background.level1',
                            '&::-webkit-scrollbar': { width: '6px' },
                            '&::-webkit-scrollbar-thumb': { borderRadius: '3px', bgcolor: 'divider' }
                        }}>
                            {availableContacts.length === 0 ? (
                                <Box sx={{ p: 3, textAlign: 'center' }}>
                                    <Typography level="body-sm" color="neutral">No hay contactos disponibles para invitar</Typography>
                                </Box>
                            ) : filteredContacts.length === 0 ? (
                                <Box sx={{ p: 3, textAlign: 'center' }}>
                                    <Typography level="body-sm" color="neutral">Sin resultados</Typography>
                                </Box>
                            ) : (
                                <List size="sm" sx={{ '--List-padding': '4px', gap: 0.25 }}>
                                    {filteredContacts.map((contact) => {
                                        const isChecked = selectedIds.includes(contact.upeerId);
                                        return (
                                            <ListItem
                                                key={contact.upeerId}
                                                onClick={() => toggleMember(contact.upeerId)}
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
                                                        onChange={() => toggleMember(contact.upeerId)}
                                                        size="sm"
                                                        color="primary"
                                                        onClick={(event) => event.stopPropagation()}
                                                    />
                                                    <Avatar size="sm" src={contact.avatar || undefined} color="neutral" sx={{ borderRadius: 'md' }}>
                                                        {contact.name[0]}
                                                    </Avatar>
                                                    <Typography level="body-sm" sx={{ fontWeight: 500 }}>{contact.name}</Typography>
                                                    <Typography level="body-xs" color="neutral" sx={{ ml: 'auto' }}>
                                                        {contact.status === 'connected' ? 'Online' : 'Offline'}
                                                    </Typography>
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
                        disabled={!group?.groupId || selectedIds.length === 0}
                        onClick={handleInvite}
                        sx={{ borderRadius: 'md', fontWeight: 600 }}
                    >
                        Añadir miembros
                    </Button>
                </DialogActions>
            </ModalDialog>
        </Modal>
    );
};