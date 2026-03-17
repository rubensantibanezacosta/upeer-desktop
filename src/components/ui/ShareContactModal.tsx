import React from 'react';
import {
    Modal,
    ModalDialog,
    DialogTitle,
    DialogContent,
    Stack,
    Typography,
    Box,
    ListItem,
    ListItemButton,
    ListItemDecorator,
    Avatar,
    List,
    Divider,
    IconButton
} from '@mui/joy';
import CloseIcon from '@mui/icons-material/Close';
import ShareIcon from '@mui/icons-material/Share';

interface Contact {
    address: string;
    name: string;
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
    return (
        <Modal open={open} onClose={onClose}>
            <ModalDialog sx={{ width: 420, maxWidth: '95vw', borderRadius: 'xl', boxShadow: 'lg', p: 0, overflow: 'hidden' }}>
                <Box sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'background.surface'
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ShareIcon color="primary" />
                        <DialogTitle sx={{ m: 0 }}>Compartir Contacto</DialogTitle>
                    </Box>
                    <IconButton variant="plain" color="neutral" size="sm" onClick={onClose}>
                        <CloseIcon />
                    </IconButton>
                </Box>
                <Divider />
                <DialogContent sx={{ maxHeight: '450px', p: 0 }}>
                    <Box sx={{ p: 2, pb: 1 }}>
                        <Typography level="body-sm">
                            Selecciona un contacto de tu lista para enviar su tarjeta de identidad de forma segura.
                        </Typography>
                    </Box>
                    <List sx={{ p: 0 }}>
                        {contacts.map((contact, i) => (
                            <ListItem key={i} sx={{ borderTop: i === 0 ? 'none' : '1px solid', borderColor: 'divider' }}>
                                <ListItemButton onClick={() => {
                                    onShare(contact);
                                    onClose();
                                }} sx={{ py: 1.5, px: 2 }}>
                                    <ListItemDecorator sx={{ mr: 2 }}>
                                        <Avatar size="md" variant="soft" color="neutral" sx={{ borderRadius: 'md' }}>{contact.name[0]}</Avatar>
                                    </ListItemDecorator>
                                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                        <Typography level="title-sm" noWrap>{contact.name}</Typography>
                                        <Typography level="body-xs" sx={{ opacity: 0.6, fontFamily: 'monospace' }} noWrap>
                                            {contact.address}
                                        </Typography>
                                    </Box>
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                </DialogContent>
            </ModalDialog>
        </Modal>
    );
};
