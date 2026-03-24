import React, { useMemo, useState } from 'react';
import {
    Avatar,
    Box,
    Button,
    Chip,
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
import ContactsRoundedIcon from '@mui/icons-material/ContactsRounded';
import BlockIcon from '@mui/icons-material/Block';
import ChatIcon from '@mui/icons-material/Chat';
import DeleteIcon from '@mui/icons-material/Delete';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import { Contact, Group } from '../../types/chat.js';

import { getTrustMeta } from './contactInfoHelpers.js';
import { SidebarSearch } from './SidebarSearch.js';

interface ContactsPanelProps {
    contacts: Contact[];
    groups?: Group[];
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

const getContactMetaLabel = (contact: Contact) => {
    switch (contact.status) {
        case 'blocked':
            return { label: 'Bloqueado', color: 'danger.400' };
        case 'incoming':
            return { label: 'Solicitud recibida', color: 'primary.400' };
        case 'pending':
            return { label: 'Pendiente', color: 'warning.400' };
        default:
            return null;
    }
};

export const ContactsPanel: React.FC<ContactsPanelProps> = ({
    contacts,
    groups = [],
    selectedContactId,
    onSelectContact,
    onOpenChat,
    onDeleteContact,
    onBlockContact,
    onUnblockContact,
}) => {
    const [filter, setFilter] = useState<'all' | 'blocked'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const visibleContacts = useMemo(
        () => {
            const normalizedQuery = searchQuery.trim().toLowerCase();
            return contacts.filter(contact => {
                if (contact.isConversationOnly) return false;
                const matchesFilter = filter === 'blocked' ? contact.status === 'blocked' : contact.status !== 'blocked';
                if (!matchesFilter) return false;
                if (!normalizedQuery) return true;
                const haystack = [contact.name, contact.alias, contact.upeerId]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return haystack.includes(normalizedQuery);
            });
        },
        [contacts, filter, searchQuery]
    );

    const activeContact = visibleContacts.find(contact => contact.upeerId === selectedContactId) || null;

    const isOnline = activeContact?.status === 'connected';
    const lastSeenText = activeContact && activeContact.lastSeen && !isOnline ?
        new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(activeContact.lastSeen))
        : null;

    const commonGroups = useMemo(() => {
        if (!activeContact) return [];
        return groups.filter(g => g.members.some(m => m === activeContact.upeerId));
    }, [activeContact, groups]);

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
                <SidebarSearch
                    value={searchQuery}
                    onChange={setSearchQuery}
                    activeFilter={filter}
                    onFilterChange={(value) => setFilter(value as 'all' | 'blocked')}
                    placeholder="Buscar contactos"
                    filters={[
                        { label: 'Activos', value: 'all' },
                        { label: 'Bloqueados', value: 'blocked' },
                    ]}
                />
                <List sx={{ '--ListItem-paddingY': '0px', p: 1, overflowY: 'auto', flexGrow: 1 }}>
                    {visibleContacts.length === 0 ? (
                        <Box sx={{ px: 3, py: 8, textAlign: 'center', color: 'text.tertiary' }}>
                            <PersonOffIcon sx={{ fontSize: 48, opacity: 0.35, mb: 1 }} />
                            <Typography level="body-sm" color="neutral">
                                {filter === 'blocked' ? 'No hay contactos bloqueados' : 'No hay contactos guardados'}
                            </Typography>
                        </Box>
                    ) : visibleContacts.map(contact => {
                        const metaLabel = getContactMetaLabel(contact);
                        return (
                            <ListItem key={contact.upeerId} sx={{ p: 0, mb: 0.5 }}>
                                <ListItemButton
                                    selected={activeContact?.upeerId === contact.upeerId}
                                    onClick={() => onSelectContact(contact.upeerId)}
                                    sx={{
                                        minHeight: '76px',
                                        px: 1.5,
                                        borderRadius: '10px',
                                        margin: 0,
                                        transition: 'background-color 0.15s ease, border-color 0.15s ease',
                                        '&:hover': { backgroundColor: 'background.level1' },
                                        '&.Mui-selected': {
                                            backgroundColor: 'background.level1',
                                        },
                                        '&.Mui-selected:hover': {
                                            backgroundColor: 'background.level1',
                                        },
                                    }}
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
                                            {metaLabel ? (
                                                <Typography level="body-xs" sx={{ color: metaLabel.color, flexShrink: 0 }}>
                                                    {metaLabel.label}
                                                </Typography>
                                            ) : null}
                                        </Box>
                                        <Typography level="body-sm" color="neutral" noWrap sx={{ opacity: 0.72 }}>
                                            {contact.alias || contact.upeerId}
                                        </Typography>
                                    </ListItemContent>
                                </ListItemButton>
                            </ListItem>
                        );
                    })}
                </List>
            </Box>

            <Box sx={{ flexGrow: 1, backgroundColor: 'background.body', overflowY: 'auto', position: 'relative' }}>
                {!activeContact ? (
                    <Box sx={{
                        height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', px: 3, textAlign: 'center'
                    }}>
                        <Box sx={{ opacity: 0.8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <Box sx={{
                                width: 100, height: 100,
                                backgroundColor: 'background.level1',
                                borderRadius: 'xl',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                mb: 3, border: '1px solid', borderColor: 'divider'
                            }}>
                                <ContactsRoundedIcon sx={{ fontSize: 56, color: 'text.tertiary' }} />
                            </Box>
                            <Typography level="h4" sx={{ fontWeight: 600, mb: 1 }}>Contactos</Typography>
                            <Typography level="body-md" sx={{ color: 'text.secondary', maxWidth: 320, lineHeight: 1.6 }}>
                                Selecciona un contacto para ver sus acciones y estado.
                            </Typography>
                        </Box>
                        <Box sx={{ position: 'absolute', bottom: 32, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography level="body-xs" color="neutral">uPeer - v1.0.0</Typography>
                        </Box>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
                        {/* ── Explorador Multimedia o Info ───────────────────── */}
                        <Box sx={{ flexGrow: 1, backgroundColor: 'background.body', overflowY: 'auto' }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pb: 8 }}>
                                <Box sx={{ width: '100%', maxWidth: 860, px: { xs: 2, md: 4 } }}>

                                    {/* ── Hero Profile ── */}
                                    <Box sx={{ mt: 6, mb: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                        <Avatar src={activeContact.avatar || undefined} variant="soft" sx={{
                                            width: 140, height: 140, fontSize: '3.5rem', borderRadius: 'xl',
                                            mb: 2.5, boxShadow: 'sm'
                                        }}>
                                            {(activeContact.name || activeContact.upeerId).charAt(0).toUpperCase()}
                                        </Avatar>
                                        <Typography level="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
                                            {activeContact.name}
                                        </Typography>
                                        <Typography level="body-sm" color="neutral" sx={{ fontFamily: 'monospace', opacity: 0.6, letterSpacing: '0.04em' }}>
                                            {activeContact.upeerId}
                                        </Typography>

                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                                            {isOnline ? (
                                                <>
                                                    <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'success.400', flexShrink: 0 }} />
                                                    <Typography level="body-xs" sx={{ color: 'success.400' }}>En línea</Typography>
                                                </>
                                            ) : activeContact.status === 'blocked' ? (
                                                <Typography level="body-xs" sx={{ color: 'danger.400' }}>Bloqueado</Typography>
                                            ) : activeContact.status === 'pending' ? (
                                                <Typography level="body-xs" sx={{ color: 'warning.400' }}>Pendiente</Typography>
                                            ) : activeContact.status === 'incoming' ? (
                                                <Typography level="body-xs" sx={{ color: 'primary.400' }}>Solicitud recibida</Typography>
                                            ) : lastSeenText ? (
                                                <Typography level="body-xs" color="neutral">Última vez {lastSeenText}</Typography>
                                            ) : null}
                                        </Box>
                                        {(() => {
                                            const trust = getTrustMeta((activeContact as any).vouchScore);
                                            if (!trust) return null;
                                            return (
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                                    <trust.Icon sx={{ fontSize: 14, color: 'text.tertiary' }} />
                                                    <Typography level="body-xs" color="neutral">{trust.label}</Typography>
                                                </Box>
                                            );
                                        })()}

                                        {/* Action buttons floating under name */}
                                        <Box sx={{ display: 'flex', gap: 1.5, mt: 3 }}>
                                            <Button
                                                variant="outlined" color="neutral" size="sm" startDecorator={<ChatIcon sx={{ fontSize: '15px' }} />}
                                                onClick={() => onOpenChat(activeContact.upeerId)}
                                                sx={{ borderRadius: 'md', px: 2 }}
                                            >
                                                Chatear
                                            </Button>

                                            {activeContact.status === 'blocked' ? (
                                                <Button
                                                    variant="outlined" color="neutral" size="sm" startDecorator={<LockOpenIcon sx={{ fontSize: '15px' }} />}
                                                    onClick={() => onUnblockContact(activeContact.upeerId)}
                                                    sx={{ borderRadius: 'md', px: 2 }}
                                                >
                                                    Desbloquear
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="outlined" color="neutral" size="sm" startDecorator={<BlockIcon sx={{ fontSize: '15px' }} />}
                                                    onClick={() => onBlockContact(activeContact.upeerId)}
                                                    sx={{ borderRadius: 'md', px: 2 }}
                                                >
                                                    Bloquear
                                                </Button>
                                            )}

                                            <Button
                                                variant="outlined" color="neutral" size="sm" startDecorator={<DeleteIcon sx={{ fontSize: '15px' }} />}
                                                onClick={() => setConfirmDeleteId(activeContact.upeerId)}
                                                sx={{ borderRadius: 'md', px: 2, '&:hover': { color: 'danger.plainColor', borderColor: 'danger.outlinedBorder', backgroundColor: 'danger.plainHoverBg' } }}
                                            >
                                                Eliminar
                                            </Button>
                                        </Box>
                                    </Box>

                                    {/* ── Info Grid ── */}
                                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 2, mb: 4 }}>
                                        {/* State & Reputation removed, merged in hero */}

                                        {activeContact.lastSeen && activeContact.status !== 'blocked' && (
                                            <Box sx={{ p: 2.5, borderRadius: 'xl', backgroundColor: 'background.surface', border: '1px solid', borderColor: 'divider' }}>
                                                <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6, mb: 1.5 }}>
                                                    Última Actividad
                                                </Typography>
                                                <Typography level="body-sm" sx={{ fontWeight: 600, fontSize: '14px' }}>
                                                    {formatRelativeDate(activeContact.lastSeen)}
                                                </Typography>
                                            </Box>
                                        )}

                                        {activeContact.blockedAt && (
                                            <Box sx={{ p: 2.5, borderRadius: 'xl', backgroundColor: 'background.surface', border: '1px solid', borderColor: 'divider' }}>
                                                <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6, mb: 1.5 }}>
                                                    Bloqueado el
                                                </Typography>
                                                <Typography level="body-sm" sx={{ fontWeight: 600, fontSize: '14px', color: 'danger.plainColor' }}>
                                                    {formatRelativeDate(activeContact.blockedAt)}
                                                </Typography>
                                            </Box>
                                        )}
                                    </Box>

                                    {/* ── Grupos en Box Surface ── */}
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        {commonGroups.length > 0 && (
                                            <Box sx={{ borderRadius: 'xl', backgroundColor: 'background.surface', border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                                                <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                    <PeopleAltIcon sx={{ fontSize: 20, color: 'text.tertiary' }} />
                                                    <Typography level="title-md" sx={{ fontWeight: 600 }}>Grupos en común</Typography>
                                                    <Chip size="sm" variant="soft" color="neutral" sx={{ ml: 'auto', fontWeight: 600 }}>{commonGroups.length}</Chip>
                                                </Box>
                                                <List sx={{ '--ListItem-paddingY': '0px', p: 0 }}>
                                                    {commonGroups.map(g => (
                                                        <ListItem key={g.groupId} sx={{ p: 0 }}>
                                                            <ListItemButton sx={{ p: 2 }}>
                                                                <ListItemDecorator sx={{ mr: 2 }}>
                                                                    <Avatar src={g.avatar || undefined} size="lg" sx={{ borderRadius: 'md' }}>
                                                                        {g.name.charAt(0).toUpperCase()}
                                                                    </Avatar>
                                                                </ListItemDecorator>
                                                                <ListItemContent>
                                                                    <Typography level="title-sm" sx={{ fontWeight: 600, mb: 0.5 }}>{g.name}</Typography>
                                                                    <Typography level="body-xs" color="neutral" noWrap>{g.members.length} miembros</Typography>
                                                                </ListItemContent>
                                                            </ListItemButton>
                                                        </ListItem>
                                                    ))}
                                                </List>
                                            </Box>
                                        )}
                                    </Box>
                                </Box>
                            </Box>
                        </Box>
                    </Box>
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
