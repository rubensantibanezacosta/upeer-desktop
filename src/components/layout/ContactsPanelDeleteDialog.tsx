import React from 'react';
import { Button, DialogActions, DialogContent, DialogTitle, Modal, ModalDialog, Typography } from '@mui/joy';
import DeleteIcon from '@mui/icons-material/Delete';
import type { Contact } from '../../types/chat.js';

interface ContactsPanelDeleteDialogProps {
    open: boolean;
    activeContact: Contact | null;
    onClose: () => void;
    onConfirm: () => void;
}

export const ContactsPanelDeleteDialog: React.FC<ContactsPanelDeleteDialogProps> = ({ open, activeContact, onClose, onConfirm }) => (
    <Modal open={open} onClose={onClose}>
        <ModalDialog variant="outlined" role="alertdialog" sx={{ minWidth: 420 }}>
            <DialogTitle>
                <DeleteIcon color="error" />
                Eliminar contacto
            </DialogTitle>
            <DialogContent>
                {activeContact ? (
                    <>
                        <Typography level="body-md">
                            ¿Quieres eliminar a <b>{activeContact.name}</b> de tus contactos?
                        </Typography>
                        <Typography level="body-sm" sx={{ mt: 1 }}>
                            El contacto desaparecerá de la agenda, pero el historial del chat se conservará en Conversaciones.
                        </Typography>
                    </>
                ) : null}
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