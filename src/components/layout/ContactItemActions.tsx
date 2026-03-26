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
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ArchiveIcon from '@mui/icons-material/Archive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import PushPinIcon from '@mui/icons-material/PushPin';
import MarkChatUnreadIcon from '@mui/icons-material/MarkChatUnread';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import type { Contact } from '../../types/chat.js';

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
}) => (
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
                    <KeyboardArrowDownIcon sx={{ fontSize: '20px' }} />
                </MenuButton>
                <Menu placement="bottom-end" size="sm" sx={{ minWidth: 180, borderRadius: 'lg', '--ListItem-radius': '8px', boxShadow: 'lg', zIndex: 1000 }}>
                    <MenuItem disabled><ListItemDecorator sx={{ color: 'inherit' }}><ArchiveIcon /></ListItemDecorator> Archivar chat</MenuItem>
                    <MenuItem disabled><ListItemDecorator sx={{ color: 'inherit' }}><NotificationsOffIcon /></ListItemDecorator> Silenciar notificaciones</MenuItem>
                    <MenuItem disabled><ListItemDecorator sx={{ color: 'inherit' }}><PushPinIcon /></ListItemDecorator> Fijar chat</MenuItem>
                    <ListDivider />
                    <MenuItem disabled><ListItemDecorator sx={{ color: 'inherit' }}><MarkChatUnreadIcon /></ListItemDecorator> Marcar como no leído</MenuItem>
                    <MenuItem onClick={(event) => { event.stopPropagation(); onToggleFavorite(contact.upeerId); }}>
                        <ListItemDecorator sx={{ color: 'inherit' }}>{contact.isFavorite ? <FavoriteIcon /> : <FavoriteBorderIcon />}</ListItemDecorator>
                        {contact.isFavorite ? 'Quitar de Favoritos' : 'Añadir a Favoritos'}
                    </MenuItem>
                    <ListDivider />
                    <MenuItem onClick={(event) => { event.stopPropagation(); setConfirmClearOpen(true); }}>
                        <ListItemDecorator sx={{ color: 'inherit' }}><DeleteSweepIcon /></ListItemDecorator>
                        Vaciar chat
                    </MenuItem>
                </Menu>
            </Dropdown>
        </Box>

        <Modal open={confirmClearOpen} onClose={() => setConfirmClearOpen(false)}>
            <ModalDialog variant="outlined" role="alertdialog" sx={{ minWidth: 400 }}>
                <DialogTitle>
                    <DeleteSweepIcon color="warning" />
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