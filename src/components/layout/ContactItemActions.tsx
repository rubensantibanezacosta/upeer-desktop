import React from 'react';
import {
    Button,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Dropdown,
    IconButton,
    ListDivider,
    ListItemDecorator,
    Menu,
    MenuButton,
    MenuItem,
    Modal,
    ModalDialog,
    Box,
    Typography,
} from '@mui/joy';
import { ChevronDown, Archive, BellOff, Pin, Mail, Heart, Eraser } from 'lucide-react';
import type { Contact } from '../../types/chat.js';
import { useChatActionsStore } from '../../store/useChatActionsStore.js';

interface ContactItemActionsProps {
    contact: Contact;
    confirmClearOpen: boolean;
    setConfirmClearOpen: React.Dispatch<React.SetStateAction<boolean>>;
    onToggleFavorite: (id: string) => void;
    onClear: (id: string) => void;
}

export const ContactItemActions: React.FC<ContactItemActionsProps> = ({
    contact,
    confirmClearOpen,
    setConfirmClearOpen,
    onToggleFavorite,
    onClear,
}) => {
    const prefs = useChatActionsStore((state) => state.contactPrefs[contact.upeerId]);
    const toggleContact = useChatActionsStore((state) => state.toggleContact);
    const archived = prefs?.archived ?? false;
    const muted = prefs?.muted ?? false;
    const pinned = prefs?.pinned ?? false;
    const unread = prefs?.unread ?? false;
    return (
    <>
        <Box className="chat-options-btn" sx={{ display: 'none', position: 'absolute', right: 0, top: '65%', transform: 'translateY(-50%)', zIndex: 2 }}>
            <Dropdown>
                <MenuButton
                    slots={{ root: IconButton }}
                    onClick={(event) => event.stopPropagation()}
                    slotProps={{
                        root: {
                            variant: 'plain',
                            color: 'neutral',
                            size: 'sm',
                            sx: { '--IconButton-size': '28px', '&:hover': { backgroundColor: 'transparent' }, '&:active': { backgroundColor: 'transparent' } },
                        },
                    }}
                >
                    <ChevronDown style={{ fontSize: 20 }} />
                </MenuButton>
                <Menu placement="bottom-end" size="sm" sx={{ minWidth: 180, borderRadius: 'lg', '--ListItem-radius': '8px', boxShadow: 'lg', zIndex: 1000 }}>
                    <MenuItem onClick={(event) => { event.stopPropagation(); toggleContact(contact.upeerId, 'archived'); }}>
                        <ListItemDecorator sx={{ color: 'inherit' }}><Archive style={{ fontSize: 18 }} /></ListItemDecorator>
                        {archived ? 'Desarchivar chat' : 'Archivar chat'}
                    </MenuItem>
                    <MenuItem onClick={(event) => { event.stopPropagation(); toggleContact(contact.upeerId, 'muted'); }}>
                        <ListItemDecorator sx={{ color: 'inherit' }}><BellOff style={{ fontSize: 18 }} /></ListItemDecorator>
                        {muted ? 'Reactivar notificaciones' : 'Silenciar notificaciones'}
                    </MenuItem>
                    <MenuItem onClick={(event) => { event.stopPropagation(); toggleContact(contact.upeerId, 'pinned'); }}>
                        <ListItemDecorator sx={{ color: 'inherit' }}><Pin style={{ fontSize: 18 }} /></ListItemDecorator>
                        {pinned ? 'Desfijar chat' : 'Fijar chat'}
                    </MenuItem>
                    <ListDivider />
                    <MenuItem onClick={(event) => { event.stopPropagation(); toggleContact(contact.upeerId, 'unread'); }}>
                        <ListItemDecorator sx={{ color: 'inherit' }}><Mail style={{ fontSize: 18 }} /></ListItemDecorator>
                        {unread ? 'Marcar como leído' : 'Marcar como no leído'}
                    </MenuItem>
                    <MenuItem onClick={(event) => { event.stopPropagation(); onToggleFavorite(contact.upeerId); }}>
                        <ListItemDecorator sx={{ color: 'inherit' }}><Heart style={{ fontSize: 18 }} fill={contact.isFavorite ? 'currentColor' : 'none'} /></ListItemDecorator>
                        {contact.isFavorite ? 'Quitar de Favoritos' : 'Añadir a Favoritos'}
                    </MenuItem>
                    <ListDivider />
                    <MenuItem onClick={(event) => { event.stopPropagation(); setConfirmClearOpen(true); }}>
                        <ListItemDecorator sx={{ color: 'inherit' }}><Eraser style={{ fontSize: 18 }} /></ListItemDecorator>
                        Vaciar chat
                    </MenuItem>
                </Menu>
            </Dropdown>
        </Box>

        <Modal open={confirmClearOpen} onClose={() => setConfirmClearOpen(false)}>
            <ModalDialog variant="outlined" role="alertdialog" sx={{ minWidth: 400 }}>
                <DialogTitle>
                    <Eraser style={{ fontSize: 20, color: 'var(--joy-palette-warning-500)' }} />
                    Vaciar mensajes del chat
                </DialogTitle>
                <Divider />
                <DialogContent>
                    <Typography level="body-md">
                        ¿Estás seguro de que quieres borrar todos los mensajes con <b>{contact.name}</b>?
                    </Typography>
                    <Typography level="body-sm" sx={{ mt: 1 }}>
                        El contacto <b>permanecerá en tu lista</b>, pero se eliminará todo el historial de conversación. Esta acción no se puede deshacer.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="solid"
                        color="warning"
                        onClick={(event) => {
                            event.stopPropagation();
                            onClear(contact.upeerId);
                            setConfirmClearOpen(false);
                        }}
                    >
                        Vaciar historial
                    </Button>
                    <Button variant="plain" color="neutral" onClick={(event) => { event.stopPropagation(); setConfirmClearOpen(false); }}>
                        Cancelar
                    </Button>
                </DialogActions>
            </ModalDialog>
        </Modal>
    </>
    );
};
