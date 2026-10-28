import React, { useState } from 'react';
import { Button, DialogActions, DialogContent, DialogTitle, Input, Modal, ModalDialog } from '@mui/joy';
import { LIST_NAME_MAX_LENGTH, sanitizeListName } from '../../../utils/chatLists.js';

interface ListNameDialogProps {
    open: boolean;
    title: string;
    confirmLabel: string;
    initialValue?: string;
    onCancel: () => void;
    onConfirm: (name: string) => void;
}

export const ListNameDialog: React.FC<ListNameDialogProps> = ({ open, title, confirmLabel, initialValue = '', onCancel, onConfirm }) => {
    const [name, setName] = useState(initialValue);
    const clean = sanitizeListName(name);

    return (
        <Modal open={open} onClose={onCancel}>
            <ModalDialog variant="outlined" sx={{ maxWidth: 380, borderRadius: 'md' }}>
                <DialogTitle>{title}</DialogTitle>
                <DialogContent>
                    <Input
                        autoFocus
                        value={name}
                        placeholder="Nombre de la lista"
                        slotProps={{ input: { maxLength: LIST_NAME_MAX_LENGTH, 'aria-label': 'Nombre de la lista' } }}
                        onChange={(event) => setName(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && clean) onConfirm(clean);
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button variant="solid" disabled={!clean} onClick={() => onConfirm(clean)}>
                        {confirmLabel}
                    </Button>
                    <Button variant="plain" color="neutral" onClick={onCancel}>
                        Cancelar
                    </Button>
                </DialogActions>
            </ModalDialog>
        </Modal>
    );
};
