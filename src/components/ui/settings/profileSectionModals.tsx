import React from 'react';
import { Box, Button, Modal, ModalClose, ModalDialog, Typography } from '@mui/joy';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DoneIcon from '@mui/icons-material/Done';
import { QRCodeSVG } from 'qrcode.react';
import {
    AlmacenamientoModalContent,
    ClaveVerificacionModalContent,
    DireccionContactoModalContent,
    DireccionRedModalContent,
    IdContactoModalContent,
    ReputacionModalContent,
} from './InfoModal.js';
import type { InfoKey } from './profileSectionBlocks.js';

interface ProfileQrModalProps {
    open: boolean;
    fullId: string;
    copied: boolean;
    onClose: () => void;
    onCopy: () => void;
}

export const ProfileQrModal: React.FC<ProfileQrModalProps> = ({ open, fullId, copied, onClose, onCopy }) => (
    <Modal open={open} onClose={onClose}>
        <ModalDialog variant="outlined" sx={{ maxWidth: 380, width: '90%', alignItems: 'center', textAlign: 'center', gap: 2 }}>
            <ModalClose />
            <Typography level="title-md" sx={{ fontWeight: 700 }}>Tu dirección de contacto</Typography>
            <Typography level="body-xs" color="neutral">Muestra este código para que alguien te agregue como contacto</Typography>
            <Box sx={{ p: 2.5, borderRadius: 'md', backgroundColor: '#ffffff', display: 'inline-flex', boxShadow: 'sm' }}>
                {fullId ? <QRCodeSVG value={fullId} size={220} level="M" includeMargin={false} /> : <Typography level="body-sm" color="neutral" sx={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Sin dirección</Typography>}
            </Box>
            <Box sx={{ width: '100%', px: 1.5, py: 1, borderRadius: 'sm', backgroundColor: 'background.level1', fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', textAlign: 'left', color: 'text.secondary' }}>
                {fullId || '—'}
            </Box>
            <Button fullWidth variant={copied ? 'soft' : 'outlined'} color={copied ? 'success' : 'neutral'} startDecorator={copied ? <DoneIcon /> : <ContentCopyIcon />} onClick={onCopy} sx={{ transition: 'all 0.2s' }}>
                {copied ? '¡Copiado!' : 'Copiar dirección'}
            </Button>
        </ModalDialog>
    </Modal>
);

interface ProfileInfoModalProps {
    activeInfo: InfoKey | null;
    onClose: () => void;
}

export const ProfileInfoModal: React.FC<ProfileInfoModalProps> = ({ activeInfo, onClose }) => (
    <Modal open={activeInfo !== null} onClose={onClose}>
        <ModalDialog variant="outlined" sx={{ maxWidth: 480, width: '90%' }}>
            <ModalClose />
            <Box sx={{ pt: 1 }}>
                {activeInfo === 'reputacion' && <ReputacionModalContent />}
                {activeInfo === 'almacenamiento' && <AlmacenamientoModalContent />}
                {activeInfo === 'direccion' && <DireccionContactoModalContent />}
                {activeInfo === 'id' && <IdContactoModalContent />}
                {activeInfo === 'clave' && <ClaveVerificacionModalContent />}
                {activeInfo === 'red' && <DireccionRedModalContent />}
            </Box>
        </ModalDialog>
    </Modal>
);