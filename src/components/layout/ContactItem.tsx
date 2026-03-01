import React from 'react';
import {
    Box,
    Typography,
    ListItem,
    ListItemButton,
    ListItemDecorator,
    Avatar,
    IconButton,
    Dropdown,
    Menu,
    MenuButton,
    MenuItem,
    ListDivider,
    Divider,
    Modal,
    ModalDialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button
} from '@mui/joy';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ArchiveIcon from '@mui/icons-material/Archive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import PushPinIcon from '@mui/icons-material/PushPin';
import NotificationsIcon from '@mui/icons-material/Notifications';
import MarkChatUnreadIcon from '@mui/icons-material/MarkChatUnread';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import BlockIcon from '@mui/icons-material/Block';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DeleteIcon from '@mui/icons-material/Delete';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';

interface ContactItemProps {
    contact: {
        revelnestId: string;
        address: string;
        name: string;
        status: 'pending' | 'incoming' | 'connected';
        lastSeen?: string;
        lastMessage?: string;
        lastMessageTime?: string;
        lastMessageIsMine?: boolean;
        lastMessageStatus?: string;
    };
    isSelected: boolean;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    isTyping: boolean;
}

export const ContactItem: React.FC<ContactItemProps> = ({ contact: c, isSelected, onSelect, onDelete, isTyping }) => {
    const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
    const isOnline = c.lastSeen && (new Date().getTime() - new Date(c.lastSeen).getTime()) < 65000;
    const isPending = c.status === 'pending' || c.status === 'incoming';

    const formatTime = (iso?: string) => {
        if (!iso) return '';
        const date = new Date(iso);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        if (diff < 86400000 && now.getDate() === date.getDate()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString();
    };

    const timeStr = formatTime(c.lastMessageTime);

    return (
        <ListItem sx={{ p: 0 }}>
            <ListItemButton
                selected={isSelected}
                onClick={() => onSelect(c.revelnestId)}
                sx={{
                    height: '72px',
                    px: 1.5,
                    borderRadius: 0,
                    margin: 0,
                    opacity: isPending ? 0.7 : 1
                }}
            >
                <ListItemDecorator sx={{ mr: 2 }}>
                    <Avatar size="lg" color={c.status === 'incoming' ? 'primary' : 'neutral'}>
                        {c.name[0]}
                    </Avatar>
                </ListItemDecorator>
                <Box sx={{
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    justifyContent: 'center',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    pb: 1,
                    pt: 1,
                    overflow: 'hidden',
                    position: 'relative',
                    '&:hover .chat-options-btn, .chat-options-btn:has(button[aria-expanded="true"])': {
                        display: 'flex'
                    }
                }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Typography level="body-md" sx={{ fontWeight: 500, display: 'flex', alignItems: 'center' }} noWrap>
                            {c.name} {c.status === 'incoming' && <NotificationsIcon color="primary" sx={{ fontSize: 18, ml: 0.5 }} />}
                        </Typography>
                        <Typography level="body-xs" color={isTyping ? "primary" : "neutral"} sx={{ ml: 1, minWidth: 'max-content' }}>
                            {timeStr}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                        <Typography
                            level="body-sm"
                            color={isPending ? "neutral" : (isTyping ? "primary" : "neutral")}
                            noWrap
                            sx={{
                                flexGrow: 1,
                                fontStyle: isPending ? 'italic' : 'normal',
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                pr: 4
                            }}
                        >
                            {isPending ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflow: 'hidden' }}>
                                    {c.status === 'pending' ? <HourglassEmptyIcon sx={{ fontSize: 14 }} /> : ''}
                                    <Typography level="body-sm" noWrap sx={{ fontStyle: 'inherit', color: 'inherit' }}>
                                        {c.status === 'pending' ? 'Esperando respuesta...' : 'Solicitud pendiente'}
                                    </Typography>
                                </Box>
                            ) : (
                                isTyping ? 'escribiendo...' : (c.lastMessage ? (
                                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, maxWidth: '100%', overflow: 'hidden' }}>
                                        {c.lastMessageIsMine && (
                                            <Box component="span" sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                                {c.lastMessageStatus === 'sent' ? (
                                                    <DoneIcon sx={{ fontSize: '16px', opacity: 0.7 }} />
                                                ) : (
                                                    <DoneAllIcon sx={{
                                                        fontSize: '16px',
                                                        color: c.lastMessageStatus === 'read' ? '#53bdeb' : 'inherit',
                                                        opacity: c.lastMessageStatus === 'read' ? 1 : 0.7
                                                    }} />
                                                )}
                                            </Box>
                                        )}
                                        <Typography
                                            level="body-sm"
                                            noWrap
                                            component="span"
                                            sx={{
                                                color: 'inherit',
                                                fontStyle: 'inherit',
                                                display: 'inline-block',
                                                maxWidth: '100%',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                verticalAlign: 'bottom'
                                            }}
                                        >
                                            {c.lastMessage}
                                        </Typography>
                                    </Box>
                                ) : (isOnline ? '🟢 En línea' : 'Desconectado'))
                            )}
                        </Typography>

                        <Box className="chat-options-btn" sx={{
                            display: 'none',
                            position: 'absolute',
                            right: 0,
                            top: '65%',
                            transform: 'translateY(-50%)',
                            zIndex: 2
                        }}>
                            <Dropdown>
                                <MenuButton
                                    slots={{ root: IconButton }}
                                    onClick={(e) => e.stopPropagation()}
                                    slotProps={{
                                        root: {
                                            variant: 'plain',
                                            color: 'neutral',
                                            size: 'sm',
                                            sx: {
                                                '--IconButton-size': '28px',
                                                '&:hover': { backgroundColor: 'transparent' },
                                                '&:active': { backgroundColor: 'transparent' }
                                            }
                                        }
                                    }}
                                >
                                    <KeyboardArrowDownIcon sx={{ fontSize: '20px' }} />
                                </MenuButton>
                                <Menu
                                    placement="bottom-end"
                                    size="sm"
                                    variant="soft"
                                    color="neutral"
                                    sx={{
                                        minWidth: 180,
                                        '--ListItem-radius': '8px',
                                        boxShadow: 'lg',
                                        zIndex: 1000
                                    }}
                                >
                                    <MenuItem><ListItemDecorator sx={{ color: 'inherit' }}><ArchiveIcon /></ListItemDecorator> Archivar chat</MenuItem>
                                    <MenuItem><ListItemDecorator sx={{ color: 'inherit' }}><NotificationsOffIcon /></ListItemDecorator> Silenciar notificaciones</MenuItem>
                                    <MenuItem><ListItemDecorator sx={{ color: 'inherit' }}><PushPinIcon /></ListItemDecorator> Fijar chat</MenuItem>
                                    <ListDivider />
                                    <MenuItem><ListItemDecorator sx={{ color: 'inherit' }}><MarkChatUnreadIcon /></ListItemDecorator> Marcar como no leído</MenuItem>
                                    <MenuItem><ListItemDecorator sx={{ color: 'inherit' }}><FavoriteBorderIcon /></ListItemDecorator> Añadir a Favoritos</MenuItem>
                                    <ListDivider />
                                    <MenuItem><ListItemDecorator sx={{ color: 'inherit' }}><BlockIcon /></ListItemDecorator> Bloquear</MenuItem>
                                    <MenuItem onClick={(e) => { e.stopPropagation(); }}><ListItemDecorator sx={{ color: 'inherit' }}><DeleteSweepIcon /></ListItemDecorator> Vaciar chat</MenuItem>
                                    <MenuItem onClick={(e) => { e.stopPropagation(); setConfirmDeleteOpen(true); }}><ListItemDecorator sx={{ color: 'inherit' }}><DeleteIcon /></ListItemDecorator> Eliminar chat</MenuItem>
                                </Menu>
                            </Dropdown>
                        </Box>
                    </Box>
                </Box>

                <Modal open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
                    <ModalDialog variant="outlined" role="alertdialog" sx={{ minWidth: 400 }}>
                        <DialogTitle>
                            <WarningRoundedIcon color="error" />
                            Confirmar eliminación
                        </DialogTitle>
                        <Divider />
                        <DialogContent>
                            <Typography level="body-md">
                                ¿Estás seguro de que quieres eliminar la conversación con <b>{c.name}</b>?
                            </Typography>
                            <Typography level="body-sm" sx={{ mt: 1 }}>
                                Esta acción no se puede deshacer y se perderán todos los datos de este contacto.
                            </Typography>
                        </DialogContent>
                        <DialogActions>
                            <Button
                                variant="solid"
                                color="danger"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(c.revelnestId);
                                    setConfirmDeleteOpen(false);
                                }}
                            >
                                Eliminar permanentemente
                            </Button>
                            <Button variant="plain" color="neutral" onClick={(e) => { e.stopPropagation(); setConfirmDeleteOpen(false); }}>
                                Cancelar
                            </Button>
                        </DialogActions>
                    </ModalDialog>
                </Modal>
            </ListItemButton>
        </ListItem>
    );
};
