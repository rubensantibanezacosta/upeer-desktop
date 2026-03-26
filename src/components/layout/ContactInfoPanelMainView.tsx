import React from 'react';
import {
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
import LockIcon from '@mui/icons-material/Lock';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Contact } from '../../types/chat.js';
import { ContactMediaStrip, SharedMediaItem } from './ContactMediaStrip.js';
import { ContactInfoHero } from './ContactInfoHero.js';
import { ContactInfoDangerAction, ContactInfoUtilityAction } from './contactInfoPanelSupport.js';

interface ContactInfoPanelMainViewProps {
    contact: Contact;
    isOnline: boolean;
    lastSeenText: string;
    trust: ReturnType<typeof import('./contactInfoHelpers.js').getTrustMeta>;
    sharedMedia: SharedMediaItem[];
    utilityActions: ContactInfoUtilityAction[];
    dangerActions: ContactInfoDangerAction[];
    onClose: () => void;
    onOpenMedia: (media: { url: string; name: string; mimeType: string; fileId: string }) => void;
    onViewAllMedia: () => void;
    onOpenCipher: () => void;
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
}) => (
    <>
        <Box
            sx={{
                height: '60px',
                px: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid',
                borderColor: 'divider',
                flexShrink: 0,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <IconButton size="sm" variant="plain" color="neutral" onClick={onClose}>
                    <CloseIcon />
                </IconButton>
                <Typography level="title-md" sx={{ fontWeight: 600 }}>Info. del contacto</Typography>
            </Box>
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

            <ContactMediaStrip items={sharedMedia} onOpenMedia={onOpenMedia} onViewAll={onViewAllMedia} />

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
                    <ListItemButton onClick={onOpenCipher} sx={{ borderRadius: 'md', py: 1.5 }}>
                        <ListItemDecorator sx={{ color: 'inherit' }}><LockIcon sx={{ fontSize: 22 }} /></ListItemDecorator>
                        <ListItemContent><Typography level="body-sm">Cifrado</Typography></ListItemContent>
                        <ChevronRightIcon sx={{ fontSize: 18, color: 'text.tertiary' }} />
                    </ListItemButton>
                </ListItem>
            </List>

            <Divider />

            <List sx={{ '--ListItemDecorator-size': '44px', px: 1, py: 0.5 }}>
                {dangerActions.map((action) => (
                    <ListItem key={action.key} sx={{ p: 0 }}>
                        <ListItemButton onClick={action.onClick} sx={{ borderRadius: 'md', py: 1.5 }}>
                            <ListItemDecorator sx={{ color: action.color }}>{action.icon}</ListItemDecorator>
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