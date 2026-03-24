import React from 'react';
import {
    Button,
    DialogActions,
    DialogContent,
    DialogTitle,
    Modal,
    ModalDialog,
    Typography,
} from '@mui/joy';

interface ContactInfoDeleteDialogProps {
    open: boolean;
    contactName: string;
    onClose: () => void;
    onConfirm: () => void;
}

export const ContactInfoDeleteDialog: React.FC<ContactInfoDeleteDialogProps> = ({ open, contactName, onClose, onConfirm }) => (
    <Modal open={open} onClose={onClose}>
        <ModalDialog variant="outlined" role="alertdialog" sx={{ minWidth: 420 }}>
            <DialogTitle>Eliminar contacto</DialogTitle>
            <DialogContent>
                <Typography level="body-md">
                    ¿Quieres eliminar a <b>{contactName}</b> de tus contactos?
                </Typography>
                <Typography level="body-sm" sx={{ mt: 1 }}>
                    El historial seguirá disponible en Conversaciones mientras no vacíes el chat.
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button variant="solid" color="danger" onClick={onConfirm}>
                    Eliminar contacto
                </Button>
                <Button variant="plain" color="neutral" onClick={onClose}>
                    Cancelar
                </Button>
            </DialogActions>
        </ModalDialog>
    </Modal>
);
