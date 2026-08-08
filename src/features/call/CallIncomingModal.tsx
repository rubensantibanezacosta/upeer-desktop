import React from 'react';
import { Box, Button, Modal, ModalDialog, Typography } from '@mui/joy';
import CallIcon from '@mui/icons-material/Call';
import type { CallKind } from './useCall.js';

interface CallIncomingModalProps {
    open: boolean;
    kind: CallKind;
    callerName: string;
    onAccept: () => void;
    onReject: () => void;
}

export const CallIncomingModal: React.FC<CallIncomingModalProps> = ({ open, kind, callerName, onAccept, onReject }) => (
    <Modal open={open} onClose={onReject}>
        <ModalDialog size="lg" sx={{ textAlign: 'center', gap: 2 }}>
            <Typography level="h4">{callerName}</Typography>
            <Typography level="body-md">{kind === 'video' ? 'Videollamada entrante' : 'Llamada entrante'}</Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                <Button color="danger" variant="soft" onClick={onReject}>Rechazar</Button>
                <Button color="success" variant="solid" startDecorator={<CallIcon />} onClick={onAccept}>Aceptar</Button>
            </Box>
        </ModalDialog>
    </Modal>
);
