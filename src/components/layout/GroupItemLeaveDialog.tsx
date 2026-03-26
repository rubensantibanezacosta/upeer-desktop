import React from 'react';
import { Button, DialogActions, DialogContent, DialogTitle, Divider, Modal, ModalDialog, Typography } from '@mui/joy';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';

interface GroupItemLeaveDialogProps {
    open: boolean;
    groupName: string;
    onClose: () => void;
    onConfirm: () => void;
}

export const GroupItemLeaveDialog: React.FC<GroupItemLeaveDialogProps> = ({ open, groupName, onClose, onConfirm }) => (
    <Modal open={open} onClose={onClose}>
        <ModalDialog variant="outlined" role="alertdialog" sx={{ minWidth: 400 }}>
            <DialogTitle>
                <WarningRoundedIcon color="error" />
                Confirmar eliminación
            </DialogTitle>
            <Divider />
            <DialogContent>
                <Typography level="body-md">
                    ¿Estás seguro de que quieres eliminar el grupo <b>{groupName}</b>?
                </Typography>
                <Typography level="body-sm" sx={{ mt: 1 }}>
                    Saldrás del grupo y se borrarán todos sus mensajes de tu dispositivo. El resto de miembros seguirán en el grupo.
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button variant="solid" color="danger" onClick={onConfirm}>
                    Eliminar permanentemente
                </Button>
                <Button variant="plain" color="neutral" onClick={onClose}>
                    Cancelar
                </Button>
            </DialogActions>
        </ModalDialog>
    </Modal>
);