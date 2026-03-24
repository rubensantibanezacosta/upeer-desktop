import React, { useEffect, useMemo, useState } from 'react';
import {
    Avatar,
    Box,
    Divider,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemContent,
    ListItemDecorator,
    Typography,
} from '@mui/joy';
import CloseIcon from '@mui/icons-material/Close';
import ArchiveIcon from '@mui/icons-material/Archive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import BlockIcon from '@mui/icons-material/Block';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import { Contact, ChatMessage } from '../../types/chat.js';
import { parseMessage } from '../../features/chat/message/MessageItem.js';
import { toMediaUrl } from '../../utils/fileUtils.js';
import { getTrustMeta, formatSeen, isMediaFile } from './contactInfoHelpers.js';
import { ContactMediaStrip, SharedMediaItem } from './ContactMediaStrip.js';
import { ContactMediaExplorer } from './ContactMediaExplorer.js';
import { ContactInfoCipherView } from './ContactInfoCipherView.js';
import { ContactInfoDeleteDialog } from './ContactInfoDeleteDialog.js';
import { ContactInfoHero } from './ContactInfoHero.js';

interface ContactInfoPanelProps {
    contact: Contact;
    chatHistory: ChatMessage[];
    activeTransfers: any[];
    onClose: () => void;
    onShare: () => void;
    onShowSecurity?: () => void;
    onClearChat: () => void;
    onBlockContact: () => void;
    onDeleteContact: () => void;
    onOpenMedia: (media: { url: string; name: string; mimeType: string; fileId: string }) => void;
    onArchive?: () => void;
    onMute?: () => void;
    onFavorite?: () => void;
}

export const ContactInfoPanel: React.FC<ContactInfoPanelProps> = ({
    contact,
    chatHistory,
    activeTransfers,
    onClose,
    onShare,
    onShowSecurity,
    onClearChat,
    onBlockContact,
    onDeleteContact,
    onOpenMedia,
    onArchive,
    onMute,
    onFavorite,
}) => {
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [currentView, setCurrentView] = useState<'main' | 'media' | 'cipher'>('main');
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(t);
    }, []);

    const isOnline = !!contact.lastSeen && (now - new Date(contact.lastSeen).getTime()) < 65000;
    const lastSeenText = formatSeen(contact.lastSeen);
    const trust = getTrustMeta((contact as any).vouchScore);

    const sharedMedia = useMemo(() => {
        return chatHistory
            .map((msg) => {
                const { fileData } = parseMessage(msg.message, msg.isMine, activeTransfers);
                if (!fileData || !isMediaFile(fileData.mimeType, fileData.fileName, fileData.isVoiceNote)) return null;
                const preview = fileData.thumbnail
                    ? (fileData.thumbnail.startsWith('data:') ? fileData.thumbnail : toMediaUrl(fileData.thumbnail))
                    : (fileData.savedPath ? toMediaUrl(fileData.savedPath) : '');
                return {
                    fileId: fileData.fileId,
                    fileName: fileData.fileName,
                    mimeType: fileData.mimeType,
                    url: fileData.savedPath || '',
                    preview,
                };
            })
            .filter((item): item is SharedMediaItem => !!item)
            .reverse();
    }, [activeTransfers, chatHistory]);

    const utilityActions = [
        {
            key: 'share',
            label: 'Compartir contacto',
            icon: <ShareOutlinedIcon sx={{ fontSize: 22 }} />,
            onClick: onShare,
            disabled: false,
        },
        {
            key: 'mute',
            label: 'Silenciar notificaciones',
            icon: <NotificationsOffIcon sx={{ fontSize: 22 }} />,
            onClick: onMute,
            disabled: !onMute,
        },
        {
            key: 'archive',
            label: 'Archivar chat',
            icon: <ArchiveIcon sx={{ fontSize: 22 }} />,
            onClick: onArchive,
            disabled: !onArchive,
        },
        {
            key: 'favorite',
            label: contact.isFavorite ? 'Quitar de Favoritos' : 'Añadir a Favoritos',
            icon: contact.isFavorite ? <FavoriteIcon sx={{ fontSize: 22 }} /> : <FavoriteBorderIcon sx={{ fontSize: 22 }} />,
            onClick: onFavorite,
            disabled: !onFavorite,
        },
    ];

    return (
        <>
            <Box sx={{
                width: 480,
                minWidth: 380,
                maxWidth: 480,
                flexShrink: 0,
                borderLeft: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'background.surface',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
                position: 'relative',
            }}>
                {/* VISTA PRINCIPAL */}
                <Box sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    transform: currentView === 'main' ? 'translateX(0)' : 'translateX(-100%)',
                    transition: 'transform 0.25s ease-in-out',
                    visibility: currentView === 'main' ? 'visible' : 'hidden',
                }}>
                    <Box sx={{
                        height: '60px',
                        px: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        flexShrink: 0,
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <IconButton size="sm" variant="plain" color="neutral" onClick={onClose}>
                                <CloseIcon />
                            </IconButton>
                            <Typography level="title-md" sx={{ fontWeight: 600 }}>Info. del contacto</Typography>
                        </Box>
                    </Box>

                    <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                        {/* Hero */}
                        <ContactInfoHero
                            avatar={contact.avatar}
                            contactName={contact.name}
                            contactId={contact.upeerId}
                            isOnline={isOnline}
                            status={contact.status}
                            lastSeenText={lastSeenText}
                            trust={trust}
                        />

                        {/* Sección media */}
                        <ContactMediaStrip items={sharedMedia} onOpenMedia={onOpenMedia} onViewAll={() => setCurrentView('media')} />

                        {/* Acciones normales */}
                        <List sx={{ '--ListItemDecorator-size': '44px', px: 1, py: 0.5 }}>
                            {utilityActions.map((action) => (
                                <ListItem key={action.key} sx={{ p: 0 }}>
                                    <ListItemButton disabled={action.disabled} onClick={action.onClick} sx={{ borderRadius: 'md', py: 1.5 }}>
                                        <ListItemDecorator sx={{ color: 'inherit' }}>{action.icon}</ListItemDecorator>
                                        <ListItemContent><Typography level="body-sm">{action.label}</Typography></ListItemContent>
                                    </ListItemButton>
                                </ListItem>
                            ))}
                            <ListItem sx={{ p: 0 }}>
                                <ListItemButton onClick={() => setCurrentView('cipher')} sx={{ borderRadius: 'md', py: 1.5 }}>
                                    <ListItemDecorator sx={{ color: 'inherit' }}><LockIcon sx={{ fontSize: 22 }} /></ListItemDecorator>
                                    <ListItemContent><Typography level="body-sm">Cifrado</Typography></ListItemContent>
                                    <ChevronRightIcon sx={{ fontSize: 18, color: 'text.tertiary' }} />
                                </ListItemButton>
                            </ListItem>
                        </List>

                        <Divider />

                        {/* Acciones de peligro */}
                        <List sx={{ '--ListItemDecorator-size': '44px', px: 1, py: 0.5 }}>
                            <ListItem sx={{ p: 0 }}>
                                <ListItemButton onClick={onClearChat} sx={{ borderRadius: 'md', py: 1.5 }}>
                                    <ListItemDecorator sx={{ color: 'warning.500' }}><DeleteSweepIcon sx={{ fontSize: 22 }} /></ListItemDecorator>
                                    <ListItemContent><Typography level="body-sm" sx={{ color: 'warning.600' }}>Vaciar chat</Typography></ListItemContent>
                                </ListItemButton>
                            </ListItem>
                            <ListItem sx={{ p: 0 }}>
                                <ListItemButton onClick={onBlockContact} sx={{ borderRadius: 'md', py: 1.5 }}>
                                    <ListItemDecorator sx={{ color: 'danger.500' }}>
                                        {contact.status === 'blocked'
                                            ? <LockOpenIcon sx={{ fontSize: 22 }} />
                                            : <BlockIcon sx={{ fontSize: 22 }} />
                                        }
                                    </ListItemDecorator>
                                    <ListItemContent>
                                        <Typography level="body-sm" sx={{ color: 'danger.600' }}>
                                            {contact.status === 'blocked' ? 'Desbloquear' : `Bloquear a ${contact.name}`}
                                        </Typography>
                                    </ListItemContent>
                                </ListItemButton>
                            </ListItem>
                            <ListItem sx={{ p: 0 }}>
                                <ListItemButton onClick={() => setConfirmDeleteOpen(true)} sx={{ borderRadius: 'md', py: 1.5 }}>
                                    <ListItemDecorator sx={{ color: 'danger.500' }}><PersonRemoveIcon sx={{ fontSize: 22 }} /></ListItemDecorator>
                                    <ListItemContent>
                                        <Typography level="body-sm" sx={{ color: 'danger.600' }}>Eliminar contacto</Typography>
                                    </ListItemContent>
                                </ListItemButton>
                            </ListItem>
                        </List>
                    </Box>
                </Box>

                {/* VISTA MEDIA EXPLORER */}
                <Box sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'background.surface',
                    transform: currentView === 'media' ? 'translateX(0)' : 'translateX(100%)',
                    transition: 'transform 0.25s ease-in-out',
                    zIndex: 10,
                    visibility: currentView === 'media' ? 'visible' : 'hidden',
                }}>
                    <ContactMediaExplorer items={sharedMedia} onBack={() => setCurrentView('main')} onOpenMedia={onOpenMedia} />
                </Box>

                {/* VISTA CIFRADO */}
                <Box sx={{
                    position: 'absolute',
                    inset: 0,
                    transform: currentView === 'cipher' ? 'translateX(0)' : 'translateX(100%)',
                    transition: 'transform 0.25s ease-in-out',
                    visibility: currentView === 'cipher' ? 'visible' : 'hidden',
                }}>
                    <ContactInfoCipherView
                        contactName={contact.name}
                        onBack={() => setCurrentView('main')}
                        onShowSecurity={onShowSecurity}
                    />
                </Box>
            </Box>

            <ContactInfoDeleteDialog
                open={confirmDeleteOpen}
                contactName={contact.name}
                onClose={() => setConfirmDeleteOpen(false)}
                onConfirm={() => {
                    onDeleteContact();
                    setConfirmDeleteOpen(false);
                }}
            />
        </>
    );
};
