import React, { useState } from 'react';
import { Avatar, Box, Button, Chip, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItem, ListItemButton, ListItemContent, ListItemDecorator, Modal, ModalDialog, Tooltip, Typography } from '@mui/joy';
import { X, Users, UserPlus, BellOff, Heart, Eraser, LogOut, ShieldCheck, UserMinus, Phone, Video, Search } from 'lucide-react';
import { Contact, Group } from '../../types/chat.js';
import { useChatActionsStore } from '../../store/useChatActionsStore.js';
import { ContactMediaExplorer } from './ContactMediaExplorer.js';
import { ContactMediaStrip, SharedMediaItem } from './ContactMediaStrip.js';
import { SectionSeparator, actionButtonSx, actionsRowSx, rowButtonSx, rowIconSx, rowsSx } from './infoPanelRows.js';
import { usePanelView, type GroupPanelView } from './contactInfoPanelSupport.js';
import { ChatSearchView } from '../../features/chat/ChatSearchView.js';

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
    callsUnavailable?: boolean;
    view?: GroupPanelView;
    onViewChange?: (view: GroupPanelView) => void;
}

export const GroupInfoPanel: React.FC<GroupInfoPanelProps> = ({ group, contacts, currentUserId, sharedMedia = [], onClose, onInviteMembers, onOpenMedia, onFavorite, onClearChat, onLeaveGroup, onTransferAdmin, onRemoveMember, onCallAudio, onCallVideo, callsUnavailable = false, view, onViewChange }) => {
    const [currentView, setCurrentView] = usePanelView<GroupPanelView>(view, onViewChange, 'main');
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
            <Box sx={{ height: 60, px: 2, display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                <IconButton aria-label="Cerrar info del grupo" size="sm" variant="plain" color="neutral" onClick={onClose}>
                    <X style={{ fontSize: 20 }} />
                </IconButton>
                <Typography level="title-md" sx={{ fontWeight: 600 }}>Info. del grupo</Typography>
            </Box>
            {currentView === 'search' ? (
                <Box sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden' }}>
                    <ChatSearchView conversationKey={group.groupId} onBack={() => setCurrentView('main')} />
                </Box>
            ) : currentView === 'media' ? (
                <Box sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden' }}>
                    <ContactMediaExplorer items={sharedMedia} onBack={() => setCurrentView('main')} onOpenMedia={onOpenMedia ?? (() => undefined)} />
                </Box>
            ) : <Box sx={{ flexGrow: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden' }}>
                <Box sx={{ pt: 4, pb: 2, px: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 0.75 }}>
                    <Avatar src={group.avatar || undefined} variant="soft" sx={{ width: 96, height: 96, mb: 1 }}>
                        {!group.avatar && <Users style={{ fontSize: 40 }} />}
                    </Avatar>
                    <Typography level="h3" sx={{ fontWeight: 700 }}>{group.name}</Typography>
                    <Typography level="body-xs" color="neutral">Grupo · {group.members.length} miembro{group.members.length === 1 ? '' : 's'}</Typography>
                </Box>
                <Box sx={actionsRowSx}>
                    <Tooltip title="Llamar al grupo" variant="soft">
                        <span>
                            <IconButton aria-label="Llamar al grupo" variant="plain" disabled={callsUnavailable} onClick={onCallAudio} sx={actionButtonSx}>
                                <Phone style={{ fontSize: 20 }} />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Videollamar al grupo" variant="soft">
                        <span>
                            <IconButton aria-label="Videollamar al grupo" variant="plain" disabled={callsUnavailable} onClick={onCallVideo} sx={actionButtonSx}>
                                <Video style={{ fontSize: 20 }} />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Buscar en el chat" variant="soft">
                        <span>
                            <IconButton aria-label="Buscar en el chat" variant="plain" onClick={() => setCurrentView('search')} sx={actionButtonSx}>
                                <Search style={{ fontSize: 20 }} />
                            </IconButton>
                        </span>
                    </Tooltip>
                </Box>
                <SectionSeparator />
                <Box sx={{ px: 2, pt: 1, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography level="title-sm">Miembros</Typography>
                    {isAdmin && <Button size="sm" variant="plain" startDecorator={<UserPlus style={{ fontSize: 18 }} />} onClick={onInviteMembers} sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>Añadir</Button>}
                </Box>
                {members.length ? (
                    <List sx={rowsSx}>
                        {members.map(({ id, contact, isAdmin: memberIsAdmin, isCurrentUser }) => {
                            const name = isCurrentUser ? 'Tú' : contact?.name || `${id.slice(0, 12)}…`;
                            return (
                                <ListItem key={id} sx={{ p: 0 }}>
                                    <ListItemButton sx={{ ...rowButtonSx, cursor: 'default', '&:hover': { backgroundColor: 'transparent' } }}>
                                        <ListItemDecorator sx={{ color: 'inherit' }}>
                                            <Avatar src={contact?.avatar || undefined} size="sm" sx={{ width: 32, height: 32 }}>{name.charAt(0).toUpperCase()}</Avatar>
                                        </ListItemDecorator>
                                        <ListItemContent>
                                            <Typography level="body-sm">{name}</Typography>
                                            {contact?.alias && contact.alias !== contact.name && <Typography level="body-xs" color="neutral">{contact.alias}</Typography>}
                                        </ListItemContent>
                                        {memberIsAdmin && <Chip size="sm" variant="soft" color="success">Admin. del grupo</Chip>}
                                        {isAdmin && !isCurrentUser && !memberIsAdmin && <>
                                            <Tooltip title={`Hacer administrador a ${name}`} variant="soft">
                                                <IconButton aria-label={`Hacer admin a ${name}`} size="sm" variant="plain" onClick={() => setConfirmAction({ type: 'transfer', memberId: id })}><ShieldCheck style={{ fontSize: 18 }} /></IconButton>
                                            </Tooltip>
                                            <Tooltip title={`Expulsar a ${name}`} variant="soft">
                                                <IconButton aria-label={`Expulsar a ${name}`} size="sm" variant="plain" color="danger" onClick={() => setConfirmAction({ type: 'remove', memberId: id })}><UserMinus style={{ fontSize: 18 }} /></IconButton>
                                            </Tooltip>
                                        </>}
                                    </ListItemButton>
                                </ListItem>
                            );
                        })}
                    </List>
                ) : (
                    <Typography level="body-sm" color="neutral" sx={{ px: 3, py: 2 }}>No hay miembros disponibles.</Typography>
                )}
                <SectionSeparator />
                <ContactMediaStrip items={sharedMedia} onOpenMedia={onOpenMedia ?? (() => undefined)} onViewAll={() => setCurrentView('media')} />
                <SectionSeparator />
                <List sx={rowsSx}>
                    <ListItem sx={{ p: 0 }}>
                        <ListItemButton onClick={() => toggleGroup(group.groupId, 'muted')} sx={rowButtonSx}>
                            <ListItemDecorator sx={{ color: 'inherit' }}>
                                <Box sx={rowIconSx}><BellOff style={{ fontSize: 20 }} /></Box>
                            </ListItemDecorator>
                            <ListItemContent><Typography level="body-sm">{groupPrefs?.muted ? 'Reactivar notificaciones' : 'Silenciar notificaciones'}</Typography></ListItemContent>
                        </ListItemButton>
                    </ListItem>
                    <ListItem sx={{ p: 0 }}>
                        <ListItemButton onClick={onFavorite} disabled={!onFavorite} sx={rowButtonSx}>
                            <ListItemDecorator sx={{ color: 'inherit' }}>
                                <Box sx={rowIconSx}><Heart style={{ fontSize: 20 }} fill={group.isFavorite ? 'currentColor' : 'none'} /></Box>
                            </ListItemDecorator>
                            <ListItemContent><Typography level="body-sm">{group.isFavorite ? 'Quitar de Favoritos' : 'Añadir a Favoritos'}</Typography></ListItemContent>
                        </ListItemButton>
                    </ListItem>
                </List>
                <SectionSeparator />
                <List sx={rowsSx}>
                    <ListItem sx={{ p: 0 }}>
                        <ListItemButton disabled={!onClearChat} onClick={() => setConfirmAction({ type: 'clear' })} sx={rowButtonSx}>
                            <ListItemDecorator sx={{ color: 'warning.500' }}>
                                <Box sx={{ ...rowIconSx, color: 'warning.500' }}><Eraser style={{ fontSize: 20 }} /></Box>
                            </ListItemDecorator>
                            <ListItemContent><Typography level="body-sm" sx={{ color: 'warning.500' }}>Vaciar chat</Typography></ListItemContent>
                        </ListItemButton>
                    </ListItem>
                    <ListItem sx={{ p: 0 }}>
                        <ListItemButton disabled={!onLeaveGroup} onClick={() => setConfirmAction({ type: 'leave' })} sx={rowButtonSx}>
                            <ListItemDecorator sx={{ color: 'danger.500' }}>
                                <Box sx={{ ...rowIconSx, color: 'danger.500' }}><LogOut style={{ fontSize: 20 }} /></Box>
                            </ListItemDecorator>
                            <ListItemContent><Typography level="body-sm" sx={{ color: 'danger.500' }}>Salir del grupo</Typography></ListItemContent>
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