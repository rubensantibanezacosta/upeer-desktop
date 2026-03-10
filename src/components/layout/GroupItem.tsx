import React, { useState } from 'react';
import {
    Box,
    Typography,
    ListItem,
    ListItemButton,
    ListItemDecorator,
    Avatar,
    Dropdown,
    MenuButton,
    Menu,
    MenuItem,
    ListDivider,
    IconButton,
    Modal,
    ModalDialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Divider,
} from '@mui/joy';
import GroupsIcon from '@mui/icons-material/Groups';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ArchiveIcon from '@mui/icons-material/Archive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import PushPinIcon from '@mui/icons-material/PushPin';
import MarkChatUnreadIcon from '@mui/icons-material/MarkChatUnread';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import { Group } from '../../types/chat.js';

interface GroupItemProps {
    group: Group;
    isSelected: boolean;
    onSelect: (groupId: string) => void;
    onLeaveGroup?: (groupId: string) => void;
}

export const GroupItem: React.FC<GroupItemProps> = ({ group, isSelected, onSelect, onLeaveGroup }) => {
    const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);

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

    const timeStr = formatTime(group.lastMessageTime);

    return (
        <ListItem sx={{ p: 0 }}>
            <ListItemButton
                selected={isSelected}
                onClick={() => onSelect(group.groupId)}
                sx={{
                    height: '72px',
                    px: 1.5,
                    borderRadius: 0,
                    margin: 0,
                }}
            >
                <ListItemDecorator sx={{ mr: 2 }}>
                    <Avatar
                        size="lg"
                        src={group.avatar || undefined}
                        color="primary"
                        variant="soft"
                        sx={!group.avatar ? { background: 'linear-gradient(135deg, var(--joy-palette-primary-500), var(--joy-palette-primary-700))' } : {}}
                    >
                        {!group.avatar && <GroupsIcon sx={{ fontSize: 24, color: 'white' }} />}
                    </Avatar>
                </ListItemDecorator>
                <Box sx={{
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    justifyContent: 'center',
                    pb: 1,
                    pt: 1,
                    overflow: 'hidden',
                    position: 'relative',
                    '&:hover .group-options-btn, .group-options-btn:has(button[aria-expanded="true"])': {
                        display: 'flex'
                    }
                }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Typography level="body-md" sx={{ fontWeight: 500 }} noWrap>
                            {group.name}
                        </Typography>
                        <Typography level="body-xs" color="neutral" sx={{ ml: 1, minWidth: 'max-content' }}>
                            {timeStr}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                        <Typography
                            level="body-sm"
                            color="neutral"
                            noWrap
                            sx={{
                                flexGrow: 1,
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {group.lastMessage
                                ? group.lastMessage
                                : `${group.members.length} miembro${group.members.length !== 1 ? 's' : ''}`}
                        </Typography>
                    </Box>

                    <Box className="group-options-btn" sx={{
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
                                sx={{
                                    minWidth: 180,
                                    borderRadius: 'lg',
                                    '--ListItem-radius': '8px',
                                    boxShadow: 'lg',
                                    zIndex: 1000
                                }}
                            >
                                <MenuItem onClick={(e) => e.stopPropagation()}><ListItemDecorator sx={{ color: 'inherit' }}><ArchiveIcon /></ListItemDecorator> Archivar chat</MenuItem>
                                <MenuItem onClick={(e) => e.stopPropagation()}><ListItemDecorator sx={{ color: 'inherit' }}><NotificationsOffIcon /></ListItemDecorator> Silenciar notificaciones</MenuItem>
                                <MenuItem onClick={(e) => e.stopPropagation()}><ListItemDecorator sx={{ color: 'inherit' }}><PushPinIcon /></ListItemDecorator> Fijar chat</MenuItem>
                                <ListDivider />
                                <MenuItem onClick={(e) => e.stopPropagation()}><ListItemDecorator sx={{ color: 'inherit' }}><MarkChatUnreadIcon /></ListItemDecorator> Marcar como no leído</MenuItem>
                                <MenuItem onClick={(e) => e.stopPropagation()}><ListItemDecorator sx={{ color: 'inherit' }}><FavoriteBorderIcon /></ListItemDecorator> Añadir a Favoritos</MenuItem>
                                <ListDivider />
                                <MenuItem onClick={(e) => e.stopPropagation()}><ListItemDecorator sx={{ color: 'inherit' }}><DeleteSweepIcon /></ListItemDecorator> Vaciar chat</MenuItem>
                                <MenuItem onClick={(e) => { e.stopPropagation(); setConfirmLeaveOpen(true); }}><ListItemDecorator sx={{ color: 'inherit' }}><ExitToAppIcon /></ListItemDecorator> Eliminar grupo</MenuItem>
                            </Menu>
                        </Dropdown>
                    </Box>
                </Box>
            </ListItemButton>

            <Modal open={confirmLeaveOpen} onClose={() => setConfirmLeaveOpen(false)}>
                <ModalDialog variant="outlined" role="alertdialog" sx={{ minWidth: 400 }}>
                    <DialogTitle>
                        <WarningRoundedIcon color="error" />
                        Confirmar eliminación
                    </DialogTitle>
                    <Divider />
                    <DialogContent>
                        <Typography level="body-md">
                            ¿Estás seguro de que quieres eliminar el grupo <b>{group.name}</b>?
                        </Typography>
                        <Typography level="body-sm" sx={{ mt: 1 }}>
                            Saldrás del grupo y se borrarán todos sus mensajes de tu dispositivo. El resto de miembros seguirán en el grupo.
                        </Typography>
                    </DialogContent>
                    <DialogActions>
                        <Button
                            variant="solid"
                            color="danger"
                            onClick={(e) => {
                                e.stopPropagation();
                                onLeaveGroup?.(group.groupId);
                                setConfirmLeaveOpen(false);
                            }}
                        >
                            Eliminar permanentemente
                        </Button>
                        <Button variant="plain" color="neutral" onClick={(e) => { e.stopPropagation(); setConfirmLeaveOpen(false); }}>
                            Cancelar
                        </Button>
                    </DialogActions>
                </ModalDialog>
            </Modal>
        </ListItem>
    );
};
