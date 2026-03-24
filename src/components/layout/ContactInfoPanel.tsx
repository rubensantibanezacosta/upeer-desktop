import React, { useEffect, useMemo, useState } from 'react';
import {
    Avatar,
    Box,
    Button,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemContent,
    ListItemDecorator,
    Modal,
    ModalDialog,
    Typography,
} from '@mui/joy';
import CloseIcon from '@mui/icons-material/Close';
import ArchiveIcon from '@mui/icons-material/Archive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import BlockIcon from '@mui/icons-material/Block';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import LockPersonIcon from '@mui/icons-material/LockPerson';
import TaskAltIcon from '@mui/icons-material/TaskAlt';

import { Contact, ChatMessage } from '../../types/chat.js';
import { parseMessage } from '../../features/chat/message/MessageItem.js';
import { toMediaUrl } from '../../utils/fileUtils.js';
import { getTrustMeta, formatSeen, isMediaFile } from './contactInfoHelpers.js';
import { ContactMediaStrip, SharedMediaItem } from './ContactMediaStrip.js';
import { ContactMediaExplorer } from './ContactMediaExplorer.js';

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
    onShare: _onShare,
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
                        <Box sx={{ pt: 4, pb: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', px: 3, gap: 0.75 }}>
                            <Avatar
                                src={contact.avatar || undefined}
                                variant="soft"
                                sx={{ width: 96, height: 96, borderRadius: 'xl', mb: 1, fontSize: '2.5rem' }}
                            >
                                {(contact.name || contact.upeerId).charAt(0).toUpperCase()}
                            </Avatar>
                            <Typography level="h3" sx={{ fontWeight: 700 }}>
                                {contact.name}
                            </Typography>
                            <Typography
                                level="body-xs"
                                color="neutral"
                                sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', letterSpacing: '0.02em' }}
                            >
                                {contact.upeerId}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                                {isOnline ? (
                                    <>
                                        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'success.400', flexShrink: 0 }} />
                                        <Typography level="body-xs" sx={{ color: 'success.400' }}>En línea</Typography>
                                    </>
                                ) : contact.status === 'blocked' ? (
                                    <Typography level="body-xs" sx={{ color: 'danger.400' }}>Bloqueado</Typography>
                                ) : contact.status === 'pending' ? (
                                    <Typography level="body-xs" sx={{ color: 'warning.400' }}>Pendiente</Typography>
                                ) : contact.status === 'incoming' ? (
                                    <Typography level="body-xs" sx={{ color: 'primary.400' }}>Solicitud recibida</Typography>
                                ) : lastSeenText ? (
                                    <Typography level="body-xs" color="neutral">Última vez {lastSeenText}</Typography>
                                ) : null}
                            </Box>
                            {trust && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <trust.Icon sx={{ fontSize: 14, color: 'text.tertiary' }} />
                                    <Typography level="body-xs" color="neutral">{trust.label}</Typography>
                                </Box>
                            )}
                        </Box>

                        {/* Sección media */}
                        <ContactMediaStrip items={sharedMedia} onOpenMedia={onOpenMedia} onViewAll={() => setCurrentView('media')} />

                        {/* Acciones normales */}
                        <List sx={{ '--ListItemDecorator-size': '44px', px: 1, py: 0.5 }}>
                            <ListItem sx={{ p: 0 }}>
                                <ListItemButton onClick={onMute} sx={{ borderRadius: 'md', py: 1.5 }}>
                                    <ListItemDecorator sx={{ color: 'inherit' }}><NotificationsOffIcon sx={{ fontSize: 22 }} /></ListItemDecorator>
                                    <ListItemContent><Typography level="body-sm">Silenciar notificaciones</Typography></ListItemContent>
                                </ListItemButton>
                            </ListItem>
                            <ListItem sx={{ p: 0 }}>
                                <ListItemButton onClick={onArchive} sx={{ borderRadius: 'md', py: 1.5 }}>
                                    <ListItemDecorator sx={{ color: 'inherit' }}><ArchiveIcon sx={{ fontSize: 22 }} /></ListItemDecorator>
                                    <ListItemContent><Typography level="body-sm">Archivar chat</Typography></ListItemContent>
                                </ListItemButton>
                            </ListItem>
                            <ListItem sx={{ p: 0 }}>
                                <ListItemButton onClick={onFavorite} sx={{ borderRadius: 'md', py: 1.5 }}>
                                    <ListItemDecorator sx={{ color: 'inherit' }}><FavoriteBorderIcon sx={{ fontSize: 22 }} /></ListItemDecorator>
                                    <ListItemContent><Typography level="body-sm">Añadir a Favoritos</Typography></ListItemContent>
                                </ListItemButton>
                            </ListItem>
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
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'background.surface',
                    transform: currentView === 'cipher' ? 'translateX(0)' : 'translateX(100%)',
                    transition: 'transform 0.25s ease-in-out',
                    zIndex: 10,
                    visibility: currentView === 'cipher' ? 'visible' : 'hidden',
                }}>
                    <Box sx={{ height: '60px', px: 2, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
                        <IconButton size="sm" variant="plain" color="neutral" onClick={() => setCurrentView('main')}>
                            <ArrowBackIcon />
                        </IconButton>
                        <Typography level="title-md" sx={{ fontWeight: 600 }}>Cifrado</Typography>
                    </Box>
                    <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 3, py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1.5 }}>
                            <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: 'success.softBg', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <LockIcon sx={{ fontSize: 32, color: 'success.400' }} />
                            </Box>
                            <Typography level="title-md" sx={{ fontWeight: 700 }}>
                                Los mensajes están protegidos
                            </Typography>
                            <Typography level="body-sm" color="neutral" sx={{ lineHeight: 1.65 }}>
                                Todo lo que escribes a <b>{contact.name}</b> se convierte en un código secreto antes de salir de tu dispositivo. Solo el teléfono o PC de {contact.name} sabe descifrarlo.
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                                <Box sx={{ width: 36, height: 36, borderRadius: 'md', bgcolor: 'background.level1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <VisibilityOffIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                                </Box>
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 600, mb: 0.25 }}>Nadie puede espiar</Typography>
                                    <Typography level="body-xs" color="neutral" sx={{ lineHeight: 1.6 }}>Ni uPeer, ni tu proveedor de internet, ni ningún intermediario puede leer tus mensajes o ver tus archivos.</Typography>
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                                <Box sx={{ width: 36, height: 36, borderRadius: 'md', bgcolor: 'background.level1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <LockPersonIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                                </Box>
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 600, mb: 0.25 }}>Solo entre vosotros dos</Typography>
                                    <Typography level="body-xs" color="neutral" sx={{ lineHeight: 1.6 }}>El cifrado se activa automáticamente. No tienes que hacer nada para estar protegido.</Typography>
                                </Box>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                                <Box sx={{ width: 36, height: 36, borderRadius: 'md', bgcolor: 'background.level1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <TaskAltIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                                </Box>
                                <Box>
                                    <Typography level="body-sm" sx={{ fontWeight: 600, mb: 0.25 }}>Puedes comprobarlo</Typography>
                                    <Typography level="body-xs" color="neutral" sx={{ lineHeight: 1.6 }}>Si quieres asegurarte de que hablas con {contact.name} y no con un impostor, puedes verificar la conexión.</Typography>
                                </Box>
                            </Box>
                        </Box>
                        {onShowSecurity && (
                            <Box sx={{ mt: 1 }}>
                                <ListItemButton onClick={onShowSecurity} sx={{ borderRadius: 'md', py: 1.5, border: '1px solid', borderColor: 'divider' }}>
                                    <ListItemDecorator sx={{ color: 'inherit' }}><LockIcon sx={{ fontSize: 20 }} /></ListItemDecorator>
                                    <ListItemContent>
                                        <Typography level="body-sm">Verificar identidad</Typography>
                                        <Typography level="body-xs" color="neutral">Confirmar que hablas con {contact.name}</Typography>
                                    </ListItemContent>
                                    <ChevronRightIcon sx={{ fontSize: 18, color: 'text.tertiary' }} />
                                </ListItemButton>
                            </Box>
                        )}
                    </Box>
                </Box>
            </Box>

            <Modal open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
                <ModalDialog variant="outlined" role="alertdialog" sx={{ minWidth: 420 }}>
                    <DialogTitle>Eliminar contacto</DialogTitle>
                    <DialogContent>
                        <Typography level="body-md">
                            ¿Quieres eliminar a <b>{contact.name}</b> de tus contactos?
                        </Typography>
                        <Typography level="body-sm" sx={{ mt: 1 }}>
                            El historial seguirá disponible en Conversaciones mientras no vacíes el chat.
                        </Typography>
                    </DialogContent>
                    <DialogActions>
                        <Button
                            variant="solid"
                            color="danger"
                            onClick={() => {
                                onDeleteContact();
                                setConfirmDeleteOpen(false);
                            }}
                        >
                            Eliminar contacto
                        </Button>
                        <Button variant="plain" color="neutral" onClick={() => setConfirmDeleteOpen(false)}>
                            Cancelar
                        </Button>
                    </DialogActions>
                </ModalDialog>
            </Modal>
        </>
    );
};
