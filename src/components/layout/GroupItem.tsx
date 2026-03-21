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
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';
import { getFileIcon } from '../../utils/fileIcons.js';
import MicIcon from '@mui/icons-material/Mic';
import { Group } from '../../types/chat.js';
import { highlightText } from '../../utils/highlightText.js';

interface GroupItemProps {
    group: Group;
    isSelected: boolean;
    onSelect: (groupId: string) => void;
    onLeaveGroup?: (groupId: string) => void;
    highlight?: string;
}

export const GroupItem: React.FC<GroupItemProps> = ({ group, isSelected, onSelect, onLeaveGroup, highlight = '' }) => {
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
                        sx={{
                            borderRadius: 'md',
                            ...(!group.avatar ? { background: 'linear-gradient(135deg, var(--joy-palette-primary-500), var(--joy-palette-primary-700))' } : {})
                        }}
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
                            {highlight ? highlightText(group.name, highlight) : group.name}
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
                            component="div"
                            sx={{
                                flexGrow: 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                overflow: 'hidden',
                            }}
                        >
                            {group.lastMessageIsMine && group.lastMessage && (
                                <Box component="span" sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                    {(group.lastMessageStatus === 'sent' || group.lastMessageStatus === 'vaulted') ? (
                                        <DoneIcon sx={{ fontSize: '16px', opacity: 0.7 }} />
                                    ) : (
                                        <DoneAllIcon sx={{
                                            fontSize: '16px',
                                            color: group.lastMessageStatus === 'read' ? '#53bdeb' : 'inherit',
                                            opacity: group.lastMessageStatus === 'read' ? 1 : 0.7
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
                                    display: 'block',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {(() => {
                                    if (!group.lastMessage) return `${group.members.length} miembro${group.members.length !== 1 ? 's' : ''}`;
                                    if (group.lastMessage.startsWith('CONTACT_CARD|')) return 'Tarjeta de contacto';

                                    if (group.lastMessage.startsWith('{') && group.lastMessage.endsWith('}')) {
                                        try {
                                            const parsed = JSON.parse(group.lastMessage);
                                            if (parsed.type === 'file') {
                                                if (parsed.isVoiceNote) {
                                                    return (
                                                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                                            <MicIcon sx={{ fontSize: 16, opacity: 0.8 }} />
                                                            <span>Nota de voz</span>
                                                        </Box>
                                                    );
                                                }
                                                return (
                                                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                                        <Box component="span" sx={{ display: 'flex', opacity: 0.8 }}>
                                                            {getFileIcon(parsed.mimeType || '', parsed.fileName || '')}
                                                        </Box>
                                                        <span>{parsed.fileName}</span>
                                                    </Box>
                                                );
                                            }
                                            if (typeof parsed.text === 'string') return parsed.text || '';
                                        } catch (e) { /* ignore */ }
                                    }

                                    if (group.lastMessage.startsWith('FILE_TRANSFER|')) {
                                        const parts = group.lastMessage.split('|');
                                        if (parts.length >= 6) {
                                            return (
                                                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                                    <Box component="span" sx={{ display: 'flex', opacity: 0.8 }}>
                                                        {getFileIcon(parts[4] || '', parts[2] || '')}
                                                    </Box>
                                                    <span>{parts[2]}</span>
                                                </Box>
                                            );
                                        }
                                    }

                                    return highlight ? highlightText(group.lastMessage, highlight) : group.lastMessage;
                                })()}
                            </Typography>
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
