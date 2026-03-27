import React from 'react';
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
    Typography,
} from '@mui/joy';
import ContactsRoundedIcon from '@mui/icons-material/ContactsRounded';
import BlockIcon from '@mui/icons-material/Block';
import ChatIcon from '@mui/icons-material/Chat';
import DeleteIcon from '@mui/icons-material/Delete';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import type { Contact, Group } from '../../types/chat.js';
import { getTrustMeta } from './contactInfoHelpers.js';

interface ContactsPanelDetailsProps {
    activeContact: Contact | null;
    commonGroups: Group[];
    isOnline: boolean;
    lastSeenText: string | null;
    onOpenChat: (upeerId: string) => void;
    onBlockContact: (upeerId: string) => void;
    onUnblockContact: (upeerId: string) => void;
    onDeleteRequest: (upeerId: string) => void;
}

const formatRelativeDate = (iso?: string | null) => {
    if (!iso) {
        return null;
    }
    return new Date(iso).toLocaleDateString([], {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

export const ContactsPanelDetails: React.FC<ContactsPanelDetailsProps> = ({
    activeContact,
    commonGroups,
    isOnline,
    lastSeenText,
    onOpenChat,
    onBlockContact,
    onUnblockContact,
    onDeleteRequest,
}) => {
    if (!activeContact) {
        return (
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', px: 3, textAlign: 'center' }}>
                <Box sx={{ opacity: 0.8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Box sx={{ width: 100, height: 100, backgroundColor: 'background.level1', borderRadius: 'xl', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3, border: '1px solid', borderColor: 'divider' }}>
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
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            <Box sx={{ flexGrow: 1, backgroundColor: 'background.body', overflowY: 'auto' }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pb: 8 }}>
                    <Box sx={{ width: '100%', maxWidth: 860, px: { xs: 2, md: 4 } }}>
                        <Box sx={{ mt: 6, mb: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                            <Avatar src={activeContact.avatar || undefined} variant="soft" sx={{ width: 140, height: 140, fontSize: '3.5rem', borderRadius: 'xl', mb: 2.5, boxShadow: 'sm' }}>
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
                                const trust = getTrustMeta(activeContact.vouchScore);
                                if (!trust) {
                                    return null;
                                }
                                return (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                        <trust.Icon sx={{ fontSize: 14, color: 'text.tertiary' }} />
                                        <Typography level="body-xs" color="neutral">{trust.label}</Typography>
                                    </Box>
                                );
                            })()}

                            <Box sx={{ display: 'flex', gap: 1.5, mt: 3 }}>
                                <Button variant="outlined" color="neutral" size="sm" startDecorator={<ChatIcon sx={{ fontSize: '15px' }} />} onClick={() => onOpenChat(activeContact.upeerId)} sx={{ borderRadius: 'md', px: 2 }}>
                                    Chatear
                                </Button>

                                {activeContact.status === 'blocked' ? (
                                    <Button variant="outlined" color="neutral" size="sm" startDecorator={<LockOpenIcon sx={{ fontSize: '15px' }} />} onClick={() => onUnblockContact(activeContact.upeerId)} sx={{ borderRadius: 'md', px: 2 }}>
                                        Desbloquear
                                    </Button>
                                ) : (
                                    <Button variant="outlined" color="neutral" size="sm" startDecorator={<BlockIcon sx={{ fontSize: '15px' }} />} onClick={() => onBlockContact(activeContact.upeerId)} sx={{ borderRadius: 'md', px: 2 }}>
                                        Bloquear
                                    </Button>
                                )}

                                <Button variant="outlined" color="neutral" size="sm" startDecorator={<DeleteIcon sx={{ fontSize: '15px' }} />} onClick={() => onDeleteRequest(activeContact.upeerId)} sx={{ borderRadius: 'md', px: 2, '&:hover': { color: 'danger.plainColor', borderColor: 'danger.outlinedBorder', backgroundColor: 'danger.plainHoverBg' } }}>
                                    Eliminar
                                </Button>
                            </Box>
                        </Box>

                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 2, mb: 4 }}>
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

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {commonGroups.length > 0 && (
                                <Box sx={{ borderRadius: 'xl', backgroundColor: 'background.surface', border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                                    <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <PeopleAltIcon sx={{ fontSize: 20, color: 'text.tertiary' }} />
                                        <Typography level="title-md" sx={{ fontWeight: 600 }}>Grupos en común</Typography>
                                        <Chip size="sm" variant="soft" color="neutral" sx={{ ml: 'auto', fontWeight: 600 }}>{commonGroups.length}</Chip>
                                    </Box>
                                    <List sx={{ '--ListItem-paddingY': '0px', p: 0 }}>
                                        {commonGroups.map((group) => (
                                            <ListItem key={group.groupId} sx={{ p: 0 }}>
                                                <ListItemButton sx={{ p: 2 }}>
                                                    <ListItemDecorator sx={{ mr: 2 }}>
                                                        <Avatar src={group.avatar || undefined} size="lg" sx={{ borderRadius: 'md' }}>
                                                            {group.name.charAt(0).toUpperCase()}
                                                        </Avatar>
                                                    </ListItemDecorator>
                                                    <ListItemContent>
                                                        <Typography level="title-sm" sx={{ fontWeight: 600, mb: 0.5 }}>{group.name}</Typography>
                                                        <Typography level="body-xs" color="neutral" noWrap>{group.members.length} miembros</Typography>
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
    );
};