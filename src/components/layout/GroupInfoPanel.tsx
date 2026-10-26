import React, { useState } from 'react';
import { Avatar, Box, Button, Chip, DialogActions, DialogContent, DialogTitle, Divider, IconButton, List, ListItem, ListItemButton, ListItemContent, Modal, ModalDialog, Tooltip, Typography } from '@mui/joy';
import CloseIcon from '@mui/icons-material/Close';
import GroupsIcon from '@mui/icons-material/Groups';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import LocalPhoneIcon from '@mui/icons-material/LocalPhone';
import VideocamIcon from '@mui/icons-material/Videocam';
import SearchIcon from '@mui/icons-material/Search';
import { Contact, Group } from '../../types/chat.js';
import { useChatActionsStore } from '../../store/useChatActionsStore.js';
import { ContactMediaExplorer } from './ContactMediaExplorer.js';
import { ContactMediaStrip, SharedMediaItem } from './ContactMediaStrip.js';

interface GroupMediaClickPayload {
    url: string;
    name: string;
    mimeType: string;
    fileId: string;
}

interface GroupInfoPanelProps {
    group: Group;
    contacts: Contact[];
    currentUserId?: string;
    sharedMedia?: SharedMediaItem[];
    onClose: () => void;
    onInviteMembers: () => void;
    onOpenMedia?: (media: GroupMediaClickPayload) => void;
    onFavorite?: () => void;
    onClearChat?: () => void;
    onLeaveGroup?: () => void;
    onTransferAdmin?: (memberId: string) => void;
    onRemoveMember?: (memberId: string) => void;
    onCallAudio?: () => void;
    onCallVideo?: () => void;
    onSearch?: () => void;
    callsUnavailable?: boolean;
}

export const GroupInfoPanel: React.FC<GroupInfoPanelProps> = ({ group, contacts, currentUserId, sharedMedia = [], onClose, onInviteMembers, onOpenMedia, onFavorite, onClearChat, onLeaveGroup, onTransferAdmin, onRemoveMember, onCallAudio, onCallVideo, onSearch, callsUnavailable = false }) => {
    const [currentView, setCurrentView] = useState<'main' | 'media'>('main');
    const [confirmAction, setConfirmAction] = useState<{ type: 'clear' | 'leave' } | { type: 'transfer' | 'remove'; memberId: string } | null>(null);
    const toggleGroup = useChatActionsStore((state) => state.toggleGroup);
    const groupPrefs = useChatActionsStore((state) => state.groupPrefs[group.groupId]);
    const members = group.members.map((memberId) => ({
        id: memberId,
        contact: contacts.find((contact) => contact.upeerId === memberId),
        isAdmin: memberId === group.adminUpeerId,
        isCurrentUser: memberId === currentUserId,
    }));
    const isAdmin = group.adminUpeerId === currentUserId;

    return (
        <Box sx={{ width: { xs: '100%', sm: 380, lg: 480 }, minWidth: 0, maxWidth: 480, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider', backgroundColor: 'background.surface', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <Box sx={{ height: 60, px: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconButton aria-label="Cerrar info del grupo" size="sm" variant="plain" color="neutral" onClick={onClose}><CloseIcon /></IconButton>
                    <Typography level="title-md" sx={{ fontWeight: 600 }}>Info. del grupo</Typography>
                </Box>
            </Box>
            {currentView === 'media' ? (
                <Box sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden' }}>
                    <ContactMediaExplorer items={sharedMedia} onBack={() => setCurrentView('main')} onOpenMedia={onOpenMedia ?? (() => undefined)} />
                </Box>
            ) : <Box sx={{ flexGrow: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden' }}>
                <Box sx={{ pt: 4, pb: 3, px: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1 }}>
                    <Avatar src={group.avatar || undefined} variant="soft" sx={{ width: 96, height: 96, mb: 1 }}>
                        {!group.avatar && <GroupsIcon sx={{ fontSize: 40 }} />}
                    </Avatar>
                    <Typography level="h3" sx={{ fontWeight: 700 }}>{group.name}</Typography>
                    <Typography level="body-sm" color="neutral">Grupo · {group.members.length} miembro{group.members.length === 1 ? '' : 's'}</Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, pt: 1 }}>
                        <Button aria-label="Llamar al grupo" disabled={callsUnavailable} onClick={onCallAudio} startDecorator={<LocalPhoneIcon />}>Llamar</Button>
                        <Button aria-label="Videollamar al grupo" disabled={callsUnavailable} onClick={onCallVideo} startDecorator={<VideocamIcon />}>Vídeo</Button>
                        <Button aria-label="Buscar en el chat" onClick={onSearch} startDecorator={<SearchIcon />}>Buscar</Button>
                    </Box>
                </Box>
                <Divider />
                <Box sx={{ px: 2, pt: 2, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography level="title-sm">Miembros</Typography>
                    {isAdmin && <Button size="sm" variant="plain" startDecorator={<PersonAddAlt1Icon />} onClick={onInviteMembers}>Añadir</Button>}
                </Box>
                {members.length ? (
                    <List sx={{ px: 1, py: 0 }}>
                        {members.map(({ id, contact, isAdmin: memberIsAdmin, isCurrentUser }) => {
                            const name = isCurrentUser ? 'Tú' : contact?.name || `${id.slice(0, 12)}…`;
                            return (
                                <ListItem key={id} sx={{ gap: 1.5, py: 1 }}>
                                    <Avatar src={contact?.avatar || undefined} size="md">{name.charAt(0).toUpperCase()}</Avatar>
                                    <ListItemContent>
                                        <Typography level="body-sm">{name}</Typography>
                                        {contact?.alias && contact.alias !== contact.name && <Typography level="body-xs" color="neutral">{contact.alias}</Typography>}
                                    </ListItemContent>
                                    {memberIsAdmin && <Chip size="sm" variant="soft" color="success">Admin. del grupo</Chip>}
                                    {isAdmin && !isCurrentUser && !memberIsAdmin && <>
                                        <Tooltip title={`Hacer administrador a ${name}`} variant="soft">
                                            <IconButton aria-label={`Hacer admin a ${name}`} size="sm" variant="plain" onClick={() => setConfirmAction({ type: 'transfer', memberId: id })}><AdminPanelSettingsIcon /></IconButton>
                                        </Tooltip>
                                        <Tooltip title={`Expulsar a ${name}`} variant="soft">
                                            <IconButton aria-label={`Expulsar a ${name}`} size="sm" variant="plain" color="danger" onClick={() => setConfirmAction({ type: 'remove', memberId: id })}><PersonRemoveIcon /></IconButton>
                                        </Tooltip>
                                    </>}
                                </ListItem>
                            );
                        })}
                    </List>
                ) : (
                    <Typography level="body-sm" color="neutral" sx={{ px: 3, py: 2 }}>No hay miembros disponibles.</Typography>
                )}
                <ContactMediaStrip items={sharedMedia} onOpenMedia={onOpenMedia ?? (() => undefined)} onViewAll={() => setCurrentView('media')} />
                <List sx={{ '--ListItemDecorator-size': '44px', px: 1, py: 0.5 }}>
                    <ListItem sx={{ p: 0 }}>
                        <ListItemButton onClick={() => toggleGroup(group.groupId, 'muted')} sx={{ borderRadius: 'md', py: 1.5 }}>
                            <ListItemContent><Typography level="body-sm">{groupPrefs?.muted ? 'Reactivar notificaciones' : 'Silenciar notificaciones'}</Typography></ListItemContent>
                            <NotificationsOffIcon sx={{ fontSize: 22 }} />
                        </ListItemButton>
                    </ListItem>
                    <ListItem sx={{ p: 0 }}>
                        <ListItemButton onClick={onFavorite} disabled={!onFavorite} sx={{ borderRadius: 'md', py: 1.5 }}>
                            <ListItemContent><Typography level="body-sm">{group.isFavorite ? 'Quitar de Favoritos' : 'Añadir a Favoritos'}</Typography></ListItemContent>
                            {group.isFavorite ? <FavoriteIcon sx={{ fontSize: 22 }} /> : <FavoriteBorderIcon sx={{ fontSize: 22 }} />}
                        </ListItemButton>
                    </ListItem>
                </List>
                <Divider />
                <List sx={{ px: 1, py: 0.5 }}>
                    <ListItem sx={{ p: 0 }}>
                        <ListItemButton color="warning" disabled={!onClearChat} onClick={() => setConfirmAction({ type: 'clear' })} sx={{ borderRadius: 'md', py: 1.5 }}>
                            <DeleteSweepIcon sx={{ mr: 2 }} /><Typography level="body-sm">Vaciar chat</Typography>
                        </ListItemButton>
                    </ListItem>
                    <ListItem sx={{ p: 0 }}>
                        <ListItemButton color="danger" disabled={!onLeaveGroup} onClick={() => setConfirmAction({ type: 'leave' })} sx={{ borderRadius: 'md', py: 1.5 }}>
                            <ExitToAppIcon sx={{ mr: 2 }} /><Typography level="body-sm">Salir del grupo</Typography>
                        </ListItemButton>
                    </ListItem>
                </List>
            </Box>
            }
                <Modal open={confirmAction !== null} onClose={() => setConfirmAction(null)}>
                <ModalDialog variant="outlined" role="alertdialog" sx={{ width: 'min(420px, calc(100vw - 32px))' }}>
                    <DialogTitle>{confirmAction?.type === 'clear' ? 'Vaciar mensajes del grupo' : confirmAction?.type === 'leave' ? 'Salir del grupo' : confirmAction?.type === 'transfer' ? 'Transferir administración' : 'Expulsar miembro'}</DialogTitle>
                    <DialogContent>
                        <Typography level="body-md">{confirmAction?.type === 'clear' ? <>¿Quieres borrar todo el historial de <b>{group.name}</b> de este dispositivo?</> : confirmAction?.type === 'leave' ? <>¿Quieres salir de <b>{group.name}</b>? Se eliminará el historial de este dispositivo.</> : confirmAction?.type === 'transfer' || confirmAction?.type === 'remove' ? <>{confirmAction.type === 'transfer' ? '¿Quieres hacer administrador a ' : '¿Quieres expulsar a '}<b>{members.find((member) => member.id === confirmAction.memberId)?.contact?.name || confirmAction.memberId}</b>{confirmAction.type === 'transfer' ? '? Dejarás de ser administrador.' : ' del grupo?'}</> : null}</Typography>
                        <Typography level="body-sm" sx={{ mt: 1 }}>Esta acción no se puede deshacer.</Typography>
                    </DialogContent>
                    <DialogActions>
                        <Button color="danger" variant="solid" onClick={() => {
                            if (confirmAction?.type === 'clear') onClearChat?.();
                            if (confirmAction?.type === 'leave') onLeaveGroup?.();
                            if (confirmAction?.type === 'transfer') onTransferAdmin?.(confirmAction.memberId);
                            if (confirmAction?.type === 'remove') onRemoveMember?.(confirmAction.memberId);
                            setConfirmAction(null);
                        }}>{confirmAction?.type === 'clear' ? 'Vaciar historial' : confirmAction?.type === 'leave' ? 'Salir del grupo' : confirmAction?.type === 'transfer' ? 'Transferir administración' : 'Expulsar del grupo'}</Button>
                        <Button variant="plain" color="neutral" onClick={() => setConfirmAction(null)}>Cancelar</Button>
                    </DialogActions>
                </ModalDialog>
            </Modal>
        </Box>
    );
};