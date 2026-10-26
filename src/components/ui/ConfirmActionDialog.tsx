import React from 'react';
import { Button, DialogActions, DialogContent, DialogTitle, Divider, Modal, ModalDialog, Typography } from '@mui/joy';
import { TriangleAlert } from 'lucide-react';

interface ConfirmActionDialogProps {
    open: boolean;
    title: string;
    description: string;
    detail?: string;
    confirmLabel: string;
    color?: 'danger' | 'warning' | 'primary';
    onCancel: () => void;
    onConfirm: () => void;
}

const accentByColor = {
    danger: 'var(--joy-palette-danger-500)',
    warning: 'var(--joy-palette-warning-500)',
    primary: 'var(--joy-palette-primary-500)',
} as const;

export const ConfirmActionDialog: React.FC<ConfirmActionDialogProps> = ({
    open,
    title,
    description,
    detail,
    confirmLabel,
    color = 'danger',
    onCancel,
    onConfirm,
}) => (
    <Modal open={open} onClose={onCancel}>
        <ModalDialog variant="outlined" role="alertdialog" sx={{ maxWidth: 420, borderRadius: 'md' }}>
            <DialogTitle>
                <TriangleAlert style={{ fontSize: 20, color: accentByColor[color] }} />
                {title}
            </DialogTitle>
            <Divider />
            <DialogContent>
                <Typography level="body-md">{description}</Typography>
                {detail && (
                    <Typography level="body-sm" sx={{ mt: 1, color: 'text.tertiary' }}>
                        {detail}
                    </Typography>
                )}
            </DialogContent>
            <DialogActions>
                <Button variant="solid" color={color} onClick={onConfirm}>
                    {confirmLabel}
                </Button>
                <Button variant="plain" color="neutral" onClick={onCancel}>
                    Cancelar
                </Button>
            </DialogActions>
        </ModalDialog>
    </Modal>
);
