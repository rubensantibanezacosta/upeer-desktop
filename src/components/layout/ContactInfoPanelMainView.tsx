import React from 'react';
import {
    Box,
    Button,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemContent,
    ListItemDecorator,
    Typography,
} from '@mui/joy';
import { X, Lock, ChevronRight, Phone, Video, Search } from 'lucide-react';
import { Contact } from '../../types/chat.js';
import { ContactMediaStrip, SharedMediaItem } from './ContactMediaStrip.js';
import { ContactInfoHero } from './ContactInfoHero.js';
import { ContactInfoDangerAction, ContactInfoUtilityAction } from './contactInfoPanelSupport.js';
import { SectionSeparator, actionButtonSx, rowButtonSx, rowIconSx, rowsSx } from './infoPanelRows.js';

interface ContactInfoPanelMainViewProps {
    contact: Contact;
    isOnline: boolean;
    lastSeenText: string | null;
    trust: ReturnType<typeof import('./contactInfoHelpers.js').getTrustMeta>;
    sharedMedia: SharedMediaItem[];
    utilityActions: ContactInfoUtilityAction[];
    dangerActions: ContactInfoDangerAction[];
    onClose: () => void;
    onOpenMedia: (media: { url: string; name: string; mimeType: string; fileId: string }) => void;
    onViewAllMedia: () => void;
    onOpenCipher: () => void;
    onCallAudio: () => void;
    onCallVideo: () => void;
    onSearch: () => void;
    callsUnavailable: boolean;
}

export const ContactInfoPanelMainView: React.FC<ContactInfoPanelMainViewProps> = ({
    contact,
    isOnline,
    lastSeenText,
    trust,
    sharedMedia,
    utilityActions,
    dangerActions,
    onClose,
    onOpenMedia,
    onViewAllMedia,
    onOpenCipher,
    onCallAudio,
    onCallVideo,
    onSearch,
    callsUnavailable,
}) => {
    const callsDisabled = callsUnavailable
        || contact.status === 'blocked'
        || contact.status === 'pending'
        || contact.status === 'incoming';

    return (
        <>
            <Box
                sx={{
                    height: '60px',
                    px: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    flexShrink: 0,
                }}
            >
                <IconButton aria-label="Cerrar info del contacto" size="sm" variant="plain" color="neutral" onClick={onClose}>
                    <X style={{ fontSize: 20 }} />
                </IconButton>
                <Typography level="title-md" sx={{ fontWeight: 600 }}>Info. del contacto</Typography>
            </Box>

            <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                <ContactInfoHero
                    avatar={contact.avatar}
                    contactName={contact.name}
                    contactId={contact.upeerId}
                    isOnline={isOnline}
                    status={contact.status}
                    lastSeenText={lastSeenText}
                    trust={trust}
                />

                <Box sx={{ display: 'flex', gap: 0.5, px: 2, pb: 1 }}>
                    <Button aria-label="Llamar" size="sm" variant="plain" disabled={callsDisabled} onClick={onCallAudio} startDecorator={<Phone style={{ fontSize: 18 }} />} sx={actionButtonSx}>
                        Llamar
                    </Button>
                    <Button aria-label="Videollamar" size="sm" variant="plain" disabled={callsDisabled} onClick={onCallVideo} startDecorator={<Video style={{ fontSize: 18 }} />} sx={actionButtonSx}>
                        Vídeo
                    </Button>
                    <Button aria-label="Buscar en el chat" size="sm" variant="plain" onClick={onSearch} startDecorator={<Search style={{ fontSize: 18 }} />} sx={actionButtonSx}>
                        Buscar
                    </Button>
                </Box>

                <SectionSeparator />

                <ContactMediaStrip items={sharedMedia} onOpenMedia={onOpenMedia} onViewAll={onViewAllMedia} />

                <SectionSeparator />

                <List sx={rowsSx}>
                    {utilityActions.map((action) => (
                        <ListItem key={action.key} sx={{ p: 0 }}>
                            <ListItemButton disabled={action.disabled} onClick={action.onClick} sx={rowButtonSx}>
                                <ListItemDecorator sx={{ color: 'inherit' }}>
                                    <Box sx={rowIconSx}>{action.icon}</Box>
                                </ListItemDecorator>
                                <ListItemContent><Typography level="body-sm">{action.label}</Typography></ListItemContent>
                            </ListItemButton>
                        </ListItem>
                    ))}
                    <ListItem sx={{ p: 0 }}>
                        <ListItemButton aria-label="Abrir detalles de cifrado" onClick={onOpenCipher} sx={rowButtonSx}>
                            <ListItemDecorator sx={{ color: 'inherit' }}>
                                <Box sx={rowIconSx}><Lock style={{ fontSize: 20 }} /></Box>
                            </ListItemDecorator>
                            <ListItemContent>
                                <Typography level="body-sm">Cifrado</Typography>
                                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>Número de seguridad y sesión</Typography>
                            </ListItemContent>
                            <ChevronRight style={{ fontSize: 18, color: 'var(--joy-palette-text-tertiary)' }} />
                        </ListItemButton>
                    </ListItem>
                </List>

                <SectionSeparator />

                <List sx={rowsSx}>
                    {dangerActions.map((action) => (
                        <ListItem key={action.key} sx={{ p: 0 }}>
                            <ListItemButton onClick={action.onClick} sx={{ ...rowButtonSx, '&:hover': { backgroundColor: 'background.level1' } }}>
                                <ListItemDecorator sx={{ color: action.color }}>
                                    <Box sx={{ ...rowIconSx, color: action.color }}>{action.icon}</Box>
                                </ListItemDecorator>
                                <ListItemContent>
                                    <Typography level="body-sm" sx={{ color: action.color }}>{action.label}</Typography>
                                </ListItemContent>
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            </Box>
        </>
    );
};
