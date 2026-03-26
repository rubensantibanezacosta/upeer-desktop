import React, { useMemo, useState } from 'react';
import {
    Modal, ModalDialog, ModalClose, Typography, Input, Box, Avatar,
    List, ListItem, ListItemButton, ListItemContent, ListItemDecorator,
} from '@mui/joy';
import ShareIcon from '@mui/icons-material/Share';
import SearchIcon from '@mui/icons-material/Search';

interface Contact {
    address: string;
    name: string;
    avatar?: string;
    upeerId?: string;
    publicKey?: string;
}

interface ShareContactModalProps {
    open: boolean;
    onClose: () => void;
    contacts: Contact[];
    onShare: (contact: Contact) => void;
}

export const ShareContactModal: React.FC<ShareContactModalProps> = ({ open, onClose, contacts, onShare }) => {
    const [query, setQuery] = useState('');

    const filteredContacts = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const connectedContacts = contacts.filter((contact) => contact.upeerId && contact.address && contact.publicKey);
        if (!normalizedQuery) {
            return connectedContacts;
        }

        return connectedContacts.filter((contact) => (
            contact.name.toLowerCase().includes(normalizedQuery)
            || contact.address.toLowerCase().includes(normalizedQuery)
        ));
    }, [contacts, query]);

    const handleClose = () => {
        setQuery('');
        onClose();
    };

    const handleShare = (contact: Contact) => {
        onShare(contact);
        handleClose();
    };

    return (
        <Modal open={open} onClose={handleClose}>
            <ModalDialog
                variant="outlined"
                sx={{
                    width: 460,
                    maxHeight: '80vh',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0,
                    p: 0,
                    overflow: 'hidden',
                }}
            >
                <Box sx={{ px: 2.5, pt: 2, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ModalClose sx={{ position: 'static', ml: 0 }} />
                    <ShareIcon color="primary" sx={{ fontSize: 20 }} />
                    <Typography level="title-md" sx={{ fontWeight: 700, flex: 1 }}>
                        Compartir contacto
                    </Typography>
                </Box>

                <Box sx={{ px: 1.5, pb: 1.5 }}>
                    <Input
                        placeholder="Buscar un nombre o dirección"
                        startDecorator={<SearchIcon sx={{ fontSize: 18 }} />}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        autoFocus
                        size="sm"
                        sx={{ borderRadius: 'md' }}
                    />
                </Box>

                <Typography
                    level="body-xs"
                    sx={{ px: 2.5, pt: 1.5, pb: 0.5, color: 'text.tertiary', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}
                >
                    Contactos disponibles
                </Typography>

                <List sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', py: 0 }}>
                    {filteredContacts.length === 0 && (
                        <ListItem sx={{ justifyContent: 'center', py: 3 }}>
                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                Sin resultados
                            </Typography>
                        </ListItem>
                    )}
                    {filteredContacts.map((contact) => (
                        <ListItem key={contact.upeerId || contact.address} sx={{ p: 0 }}>
                            <ListItemButton
                                onClick={() => handleShare(contact)}
                                sx={{
                                    height: '72px',
                                    px: 2.5,
                                    borderRadius: 0,
                                }}
                            >
                                <ListItemDecorator sx={{ mr: 2 }}>
                                    <Avatar
                                        size="lg"
                                        src={contact.avatar}
                                        variant="soft"
                                        color="neutral"
                                        sx={{ borderRadius: 'md' }}
                                    >
                                        {contact.name[0]?.toUpperCase()}
                                    </Avatar>
                                </ListItemDecorator>
                                <ListItemContent sx={{ minWidth: 0 }}>
                                    <Typography level="body-md" sx={{ fontWeight: 500 }} noWrap>
                                        {contact.name}
                                    </Typography>
                                    <Typography level="body-sm" noWrap sx={{ color: 'text.tertiary', fontFamily: 'monospace' }}>
                                        {contact.address}
                                    </Typography>
                                </ListItemContent>
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            </ModalDialog>
        </Modal>
    );
};
