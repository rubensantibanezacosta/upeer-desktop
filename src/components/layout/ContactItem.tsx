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
    Button,
    Tooltip,
    Badge
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
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import SecurityIcon from '@mui/icons-material/Security';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import { getFileIcon } from '../../utils/fileIcons.js';
import MicIcon from '@mui/icons-material/Mic';
import { Contact } from '../../types/chat.js';
import { highlightText } from '../../utils/highlightText.js';

interface ContactItemProps {
    contact: Contact;
    isSelected: boolean;
    onSelect: (id: string) => void;
    onClear: (id: string) => void;
    isTyping: boolean;
    highlight?: string;
}

export const ContactItem: React.FC<ContactItemProps> = ({ contact: c, isSelected, onSelect, onClear, isTyping, highlight = '' }) => {
    const [confirmClearOpen, setConfirmClearOpen] = React.useState(false);
    const isOnline = c.lastSeen && (new Date().getTime() - new Date(c.lastSeen).getTime()) < 65000;
    const isPending = c.status === 'pending' || c.status === 'incoming';

    const getTrustIndicator = (showTooltip = true) => {
        const score: number | undefined = (c as any).vouchScore;
        if (score === undefined) return null;

        let icon = null;
        let label = "Reputación estándar";

        if (score < 40) {
            icon = <GppMaybeIcon sx={{ fontSize: 12, color: 'danger.600' }} />;
            label = `Baja reputación (${score}/100) - Ten cuidado`;
        } else if (score >= 80) {
            icon = <VerifiedUserIcon sx={{ fontSize: 12, color: 'success.600' }} />;
            label = `Alta reputación (${score}/100) - Muy confiable`;
        } else if (score >= 65) {
            icon = <CheckCircleIcon sx={{ fontSize: 12, color: 'primary.600' }} />;
            label = `Buena reputación (${score}/100) - Confiable`;
        } else if (score === 50) {
            icon = <NewReleasesIcon sx={{ fontSize: 12, color: 'neutral.600' }} />;
            label = "Sin historial de red aún";
        } else {
            icon = <SecurityIcon sx={{ fontSize: 12, color: 'neutral.600' }} />;
            label = `Reputación estándar (${score}/100)`;
        }

        if (!showTooltip) return icon;

        return (
            <Tooltip title={label} variant="solid" size="sm" placement="top">
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {icon}
                </Box>
            </Tooltip>
        );
    };

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

    const timeStr = isPending && c.status === 'incoming'
        ? formatTime(c.lastSeen)   // para solicitudes, mostrar cuándo llegó
        : formatTime(c.lastMessageTime);

    // Negrita cuando hay solicitud entrante o mensajes sin leer
    const hasUnread = !c.lastMessageIsMine && !!c.lastMessage && c.lastMessageStatus !== 'read';
    const isBold = c.status === 'incoming' || hasUnread;

    return (
        <ListItem sx={{ p: 0 }}>
            <ListItemButton
                selected={isSelected}
                onClick={() => onSelect(c.upeerId)}
                sx={{
                    height: '72px',
                    px: 1.5,
                    borderRadius: 0,
                    margin: 0,
                    opacity: isPending ? 0.7 : 1
                }}
            >
                <ListItemDecorator sx={{ mr: 2 }}>
                    <Badge
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        badgeContent={getTrustIndicator()}
                        sx={{
                            '--Badge-paddingX': '0px',
                            '--Badge-paddingY': '0px',
                            '--Badge-ring': '2px',
                            '& .MuiBadge-badge': {
                                width: 20,
                                height: 20,
                                borderRadius: 'sm',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: 'background.surface',
                                border: '1px solid',
                                borderColor: 'divider',

                                transform: 'translate(8%, 8%)'
                            }
                        }}
                    >
                        <Avatar
                            size="lg"
                            color={c.status === 'incoming' ? 'primary' : 'neutral'}
                            src={c.avatar || undefined}
                            variant="soft"
                            sx={{ borderRadius: 'md' }}
                        >
                            {c.name[0]}
                        </Avatar>
                    </Badge>
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
                    '&:hover .chat-options-btn, .chat-options-btn:has(button[aria-expanded="true"])': {
                        display: 'flex'
                    }
                }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Typography level="body-md" sx={{ fontWeight: 500 }} noWrap>
                            {highlight ? highlightText(c.name, highlight) : c.name}
                        </Typography>
                        <Typography level="body-xs" color={isTyping ? "primary" : isBold ? "primary" : "neutral"} sx={{ ml: 1, minWidth: 'max-content', fontWeight: isBold ? 700 : 400 }}>
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
                                fontWeight: isBold ? 700 : 400,
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                pr: 4
                            }}
                        >
                            {isPending ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflow: 'hidden' }}>
                                    {c.status === 'pending'
                                        ? <HourglassEmptyIcon sx={{ fontSize: 14, flexShrink: 0 }} />
                                        : <NotificationsIcon sx={{ fontSize: 14, color: 'primary.500', flexShrink: 0 }} />
                                    }
                                    <Typography level="body-sm" noWrap sx={{ fontStyle: 'inherit', color: c.status === 'incoming' ? 'primary.500' : 'inherit' }}>
                                        {c.status === 'pending' ? 'Esperando respuesta...' : 'Solicitud de contacto recibida'}
                                    </Typography>
                                </Box>
                            ) : (
                                isTyping ? 'escribiendo...' : (c.lastMessage ? (
                                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, maxWidth: '100%', overflow: 'hidden' }}>
                                        {c.lastMessageIsMine && (
                                            <Box component="span" sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                                {(c.lastMessageStatus === 'sent' || c.lastMessageStatus === 'vaulted') ? (
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
                                            {(() => {
                                                if (!c.lastMessage) return '';
                                                if (c.lastMessage.startsWith('CONTACT_CARD|')) return 'Tarjeta de contacto';

                                                if (c.lastMessage.startsWith('{') && c.lastMessage.endsWith('}')) {
                                                    try {
                                                        const parsed = JSON.parse(c.lastMessage);
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

                                                if (c.lastMessage.startsWith('FILE_TRANSFER|')) {
                                                    const parts = c.lastMessage.split('|');
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

                                                return highlight ? highlightText(c.lastMessage, highlight) : c.lastMessage;
                                            })()}
                                        </Typography>
                                    </Box>
                                ) : (isOnline ? 'En línea' : 'Desconectado'))
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
                                    sx={{
                                        minWidth: 180,
                                        borderRadius: 'lg',
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
                                    <MenuItem onClick={(e) => { e.stopPropagation(); setConfirmClearOpen(true); }}><ListItemDecorator sx={{ color: 'inherit' }}><DeleteSweepIcon /></ListItemDecorator> Vaciar chat</MenuItem>
                                </Menu>
                            </Dropdown>
                        </Box>
                    </Box>
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
                                ¿Estás seguro de que quieres borrar todos los mensajes con <b>{c.name}</b>?
                            </Typography>
                            <Typography level="body-sm" sx={{ mt: 1 }}>
                                El contacto <b>permanecerá en tu lista</b>, pero se eliminará todo el historial de conversación. Esta acción no se puede deshacer.
                            </Typography>
                        </DialogContent>
                        <DialogActions>
                            <Button
                                variant="solid"
                                color="warning"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClear(c.upeerId);
                                    setConfirmClearOpen(false);
                                }}
                            >
                                Vaciar historial
                            </Button>
                            <Button variant="plain" color="neutral" onClick={(e) => { e.stopPropagation(); setConfirmClearOpen(false); }}>
                                Cancelar
                            </Button>
                        </DialogActions>
                    </ModalDialog>
                </Modal>
            </ListItemButton>
        </ListItem>
    );
};
