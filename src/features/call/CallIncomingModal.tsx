import React from 'react';
import { Avatar, Box, Button, Modal, ModalDialog, Typography } from '@mui/joy';
import { Phone } from 'lucide-react';
import type { CallKind } from './useCall.js';

interface CallIncomingModalProps {
    open: boolean;
    kind: CallKind;
    isGroup?: boolean;
    callerName: string;
    callerAvatar?: string | null;
    onAccept: () => void;
    onReject: () => void;
}

export const CallIncomingModal: React.FC<CallIncomingModalProps> = ({ open, kind, isGroup = false, callerName, callerAvatar, onAccept, onReject }) => (
    <Modal open={open} onClose={onReject}>
        <ModalDialog size="lg" sx={{ textAlign: 'center', gap: 2 }}>
            <Avatar src={callerAvatar || undefined} sx={{ alignSelf: 'center', width: 88, height: 88, fontSize: 36 }}>{callerName.charAt(0).toUpperCase()}</Avatar>
            <Typography level="h4">{callerName}</Typography>
            <Typography level="body-md">{isGroup ? 'Llamada grupal' : kind === 'video' ? 'Videollamada entrante' : 'Llamada entrante'}</Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                <Button color="danger" variant="soft" onClick={onReject}>Rechazar</Button>
                <Button color="success" variant="solid" startDecorator={<Phone />} onClick={onAccept}>Aceptar</Button>
            </Box>
        </ModalDialog>
    </Modal>
);
