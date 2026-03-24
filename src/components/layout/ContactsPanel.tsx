import React, { useMemo, useState } from 'react';
import {
    Avatar,
    Box,
    Button,
    Chip,
    Divider,
    List,
    ListItem,
    ListItemButton,
    ListItemContent,
    ListItemDecorator,
    Modal,
    ModalDialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Typography,
} from '@mui/joy';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import BlockIcon from '@mui/icons-material/Block';
import ChatIcon from '@mui/icons-material/Chat';
import DeleteIcon from '@mui/icons-material/Delete';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import { Contact } from '../../types/chat.js';

interface ContactsPanelProps {
    contacts: Contact[];
    selectedContactId?: string;
    onSelectContact: (upeerId: string) => void;
    onOpenChat: (upeerId: string) => void;
    onDeleteContact: (upeerId: string) => void;
    onBlockContact: (upeerId: string) => void;
    onUnblockContact: (upeerId: string) => void;
}

const formatRelativeDate = (iso?: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString([], {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

const getStatusLabel = (contact: Contact) => {
    switch (contact.status) {
        case 'blocked':
            return { label: 'Bloqueado', color: 'danger' as const };
        case 'connected':
            return { label: 'Conectado', color: 'success' as const };
        case 'incoming':
            return { label: 'Solicitud recibida', color: 'primary' as const };
        case 'pending':
            return { label: 'Pendiente', color: 'warning' as const };
        default:
            return { label: 'Sin conexión', color: 'neutral' as const };
    }
};

export const ContactsPanel: React.FC<ContactsPanelProps> = ({
    contacts,
    selectedContactId,
    onSelectContact,
    onOpenChat,
    onDeleteContact,
    onBlockContact,
    onUnblockContact,
}) => {
    const [filter, setFilter] = useState<'all' | 'blocked'>('all');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const visibleContacts = useMemo(
        () => contacts.filter(contact => !contact.isConversationOnly && (filter === 'blocked' ? contact.status === 'blocked' : contact.status !== 'blocked')),
        [contacts, filter]
    );

    const activeContact = visibleContacts.find(contact => contact.upeerId === selectedContactId) || null;
    const activeStatus = activeContact ? getStatusLabel(activeContact) : null;

    return (
        <Box sx={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
            <Box
                sx={{
                    width: 400,
                    minWidth: 400,
                    flexShrink: 0,
                    borderRight: '1px solid',
                    borderColor: 'divider',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'background.surface',
                }}
            >
                <Box sx={{ px: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px', boxSizing: 'border-box' }}>
                    <Typography level="h4" sx={{ fontWeight: 600 }}>Contactos</Typography>
                    <Chip size="sm" variant="soft" color="neutral">{visibleContacts.length}</Chip>
                </Box>
                <Box sx={{ px: 2, pb: 1.5, display: 'flex', gap: 1 }}>
                    <Button
                        size="sm"
                        variant={filter === 'all' ? 'solid' : 'soft'}
                        color={filter === 'all' ? 'primary' : 'neutral'}
                        onClick={() => setFilter('all')}
                        sx={{ borderRadius: 'md', flex: 1 }}
                    >
                        Activos
                    </Button>
                    <Button
                        size="sm"
                        variant={filter === 'blocked' ? 'solid' : 'soft'}
                        color={filter === 'blocked' ? 'danger' : 'neutral'}
                        onClick={() => setFilter('blocked')}
                        sx={{ borderRadius: 'md', flex: 1 }}
                    >
                        Bloqueados
                    </Button>
                </Box>
                <List sx={{ '--ListItem-paddingY': '0px', p: 0, overflowY: 'auto', flexGrow: 1 }}>
                    {visibleContacts.length === 0 ? (
                        <Box sx={{ px: 3, py: 8, textAlign: 'center', color: 'text.tertiary' }}>
                            <PersonOffIcon sx={{ fontSize: 48, opacity: 0.35, mb: 1 }} />
                            <Typography level="body-sm" color="neutral">
                                {filter === 'blocked' ? 'No hay contactos bloqueados' : 'No hay contactos guardados'}
                            </Typography>
                        </Box>
                    ) : visibleContacts.map(contact => {
                        const status = getStatusLabel(contact);
                        return (
                            <ListItem key={contact.upeerId} sx={{ p: 0 }}>
                                <ListItemButton
                                    selected={activeContact?.upeerId === contact.upeerId}
                                    onClick={() => onSelectContact(contact.upeerId)}
                                    sx={{ height: '76px', px: 1.5, borderRadius: 0, margin: 0 }}
                                >
                                    <ListItemDecorator sx={{ mr: 2 }}>
                                        <Avatar src={contact.avatar || undefined} size="lg" variant="soft" sx={{ borderRadius: 'md' }}>
                                            {(contact.name || contact.upeerId).charAt(0).toUpperCase()}
                                        </Avatar>
                                    </ListItemDecorator>
                                    <ListItemContent>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                                            <Typography level="body-md" sx={{ fontWeight: 500 }} noWrap>
                                                {contact.name}
                                            </Typography>
                                            <Chip size="sm" color={status.color} variant="soft" sx={{ flexShrink: 0 }}>
                                                {status.label}
                                            </Chip>
                                        </Box>
                                        <Typography level="body-sm" color="neutral" noWrap>
                                            {contact.alias || contact.upeerId}
                                        </Typography>
                                    </ListItemContent>
                                </ListItemButton>
                            </ListItem>
                        );
                    })}
                </List>
            </Box>

            <Box sx={{ flexGrow: 1, backgroundColor: 'background.body', overflowY: 'auto' }}>
                {!activeContact ? (
                    <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 3, textAlign: 'center' }}>
                        <Box>
                            <AccountCircleIcon sx={{ fontSize: 52, opacity: 0.35, mb: 1 }} />
                            <Typography level="body-md" color="neutral">
                                Selecciona un contacto para ver sus acciones y estado.
                            </Typography>
                        </Box>
                    </Box>
                ) : (
                    <>
                        <Box sx={{ px: 4, py: 4, display: 'flex', alignItems: 'center', gap: 2.5 }}>
                            <Avatar src={activeContact.avatar || undefined} size="lg" sx={{ width: 72, height: 72, borderRadius: 'xl' }}>
                                {(activeContact.name || activeContact.upeerId).charAt(0).toUpperCase()}
                            </Avatar>
                            <Box sx={{ minWidth: 0 }}>
                                <Typography level="h3" sx={{ mb: 0.5 }}>
                                    {activeContact.name}
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                    <Chip size="sm" color={activeStatus?.color || 'neutral'} variant="soft">
                                        {activeStatus?.label}
                                    </Chip>
                                    <Typography level="body-sm" color="neutral" sx={{ wordBreak: 'break-all' }}>
                                        {activeContact.upeerId}
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>

                        <Divider />

                        <Box sx={{ px: 4, py: 3 }}>
                            <Typography level="title-sm" sx={{ mb: 1.5 }}>Acciones</Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                                <Button
                                    variant="solid"
                                    color="primary"
                                    startDecorator={<ChatIcon />}
                                    onClick={() => onOpenChat(activeContact.upeerId)}
                                    sx={{ borderRadius: 'md' }}
                                >
                                    Abrir chat
                                </Button>
                                {activeContact.status === 'blocked' ? (
                                    <Button
                                        variant="soft"
                                        color="success"
                                        startDecorator={<LockOpenIcon />}
                                        onClick={() => onUnblockContact(activeContact.upeerId)}
                                        sx={{ borderRadius: 'md' }}
                                    >
                                        Desbloquear
                                    </Button>
                                ) : (
                                    <Button
                                        variant="soft"
                                        color="danger"
                                        startDecorator={<BlockIcon />}
                                        onClick={() => onBlockContact(activeContact.upeerId)}
                                        sx={{ borderRadius: 'md' }}
                                    >
                                        Bloquear
                                    </Button>
                                )}
                                <Button
                                    variant="outlined"
                                    color="danger"
                                    startDecorator={<DeleteIcon />}
                                    onClick={() => setConfirmDeleteId(activeContact.upeerId)}
                                    sx={{ borderRadius: 'md' }}
                                >
                                    Eliminar contacto
                                </Button>
                            </Box>
                        </Box>

                        <Divider />

                        <Box sx={{ px: 4, py: 3, display: 'grid', gap: 2 }}>
                            <Box>
                                <Typography level="title-sm" sx={{ mb: 0.75 }}>Información</Typography>
                                <Typography level="body-sm" color="neutral">
                                    Eliminar un contacto no borra su historial. Si quieres borrar mensajes, usa “Vaciar chat” desde la conversación.
                                </Typography>
                            </Box>
                            {activeContact.blockedAt && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 600 }}>Bloqueado el</Typography>
                                    <Typography level="body-sm" color="neutral">
                                        {formatRelativeDate(activeContact.blockedAt)}
                                    </Typography>
                                </Box>
                            )}
                            {activeContact.lastSeen && activeContact.status !== 'blocked' && (
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 600 }}>Última actividad</Typography>
                                    <Typography level="body-sm" color="neutral">
                                        {formatRelativeDate(activeContact.lastSeen)}
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    </>
                )}
            </Box>

            <Modal open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)}>
                <ModalDialog variant="outlined" role="alertdialog" sx={{ minWidth: 420 }}>
                    <DialogTitle>
                        <DeleteIcon color="error" />
                        Eliminar contacto
                    </DialogTitle>
                    <DialogContent>
                        {activeContact ? (
                            <>
                                <Typography level="body-md">
                                    ¿Quieres eliminar a <b>{activeContact.name}</b> de tus contactos?
                                </Typography>
                                <Typography level="body-sm" sx={{ mt: 1 }}>
                                    El contacto desaparecerá de la agenda, pero el historial del chat se conservará en Conversaciones.
                                </Typography>
                            </>
                        ) : null}
                    </DialogContent>
                    <DialogActions>
                        <Button
                            variant="solid"
                            color="danger"
                            onClick={() => {
                                if (confirmDeleteId) onDeleteContact(confirmDeleteId);
                                setConfirmDeleteId(null);
                            }}
                        >
                            Eliminar contacto
                        </Button>
                        <Button variant="plain" color="neutral" onClick={() => setConfirmDeleteId(null)}>
                            Cancelar
                        </Button>
                    </DialogActions>
                </ModalDialog>
            </Modal>
        </Box>
    );
};
