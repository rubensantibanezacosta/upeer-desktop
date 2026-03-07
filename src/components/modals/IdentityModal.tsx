import React from 'react';
import {
    Modal,
    ModalDialog,
    DialogTitle,
    DialogContent,
    Stack,
    Typography,
    Box,
    Button,
    Divider,
    IconButton,
    Tooltip
} from '@mui/joy';
import ShieldIcon from '@mui/icons-material/Shield';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CloseIcon from '@mui/icons-material/Close';

interface IdentityModalProps {
    open: boolean;
    onClose: () => void;
    identity: {
        address: string | null;
        revelnestId: string;
        publicKey: string;
    } | null;
}

export const IdentityModal: React.FC<IdentityModalProps> = ({ open, onClose, identity }) => {

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    if (!identity) return null;

    const formatFullIdentity = (id: string, addr: string | null) => {
        if (!addr) return `${id}@?`;
        // Asegurar que la dirección tenga prefijo 200: para formato completo
        let normalizedAddr = addr;
        const parts = addr.split(':');
        if (parts.length === 7 && !addr.startsWith('200:')) {
            // Añadir prefijo 200: si tiene 7 segmentos y no empieza con 200:
            normalizedAddr = '200:' + addr;
        } else if (parts.length >= 8 && parts[0] === '200') {
            // Ya tiene prefijo 200:, usar tal cual
            normalizedAddr = addr;
        }
        // Separador @ para formato canónico
        return `${id}@${normalizedAddr}`;
    };

    const fullIdentity = formatFullIdentity(identity.revelnestId, identity.address);

    return (
        <Modal open={open} onClose={onClose}>
            <ModalDialog sx={{ width: 480, maxWidth: '95vw', borderRadius: 'xl', boxShadow: 'lg', p: 0, overflow: 'hidden' }}>
                <Box sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'background.surface'
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ShieldIcon color="primary" />
                        <DialogTitle sx={{ m: 0 }}>Mi Identidad RevelNest</DialogTitle>
                    </Box>
                    <IconButton variant="plain" color="neutral" size="sm" onClick={onClose}>
                        <CloseIcon />
                    </IconButton>
                </Box>
                <Divider />
                <DialogContent sx={{ p: 3 }}>
                    <Stack spacing={3}>
                        <Box>
                            <Typography level="body-xs" sx={{ fontWeight: 600, mb: 1, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8 }}>
                                Identidad Completa para Compartir
                            </Typography>
                            <Box sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                backgroundColor: 'background.level1',
                                p: 1.5,
                                borderRadius: 'md',
                                border: '1px solid',
                                borderColor: 'divider'
                            }}>
                                <Typography level="body-sm" sx={{ fontFamily: 'monospace', flexGrow: 1, wordBreak: 'break-all', fontSize: '13px', lineHeight: 1.5 }}>
                                    {fullIdentity}
                                </Typography>
                                <Tooltip title="Copiar Identidad" variant="soft">
                                    <IconButton size="sm" variant="plain" onClick={() => copyToClipboard(fullIdentity)}>
                                        <ContentCopyIcon sx={{ fontSize: '18px' }} />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                            <Typography level="body-xs" sx={{ mt: 1.5, opacity: 0.6, fontStyle: 'italic' }}>
                                Este es tu identificador único. Compártelo con otros para que puedan encontrarte y conectarse directamente contigo.
                            </Typography>
                        </Box>

                        <Divider>Detalles Técnicos</Divider>

                        <Stack spacing={2}>
                            <Box>
                                <Typography level="body-xs" sx={{ fontWeight: 600, mb: 0.5, opacity: 0.7 }}>
                                    RevelNest ID
                                </Typography>
                                <Typography level="body-sm" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', backgroundColor: 'background.level1', p: 1, borderRadius: 'sm', fontSize: '12px' }}>
                                    {identity.revelnestId}
                                </Typography>
                            </Box>

                            <Box>
                                <Typography level="body-xs" sx={{ fontWeight: 600, mb: 0.5, opacity: 0.7 }}>
                                    Ubicación de Red
                                </Typography>
                                <Typography level="body-sm" sx={{ fontFamily: 'monospace', backgroundColor: 'background.level1', p: 1, borderRadius: 'sm', fontSize: '12px' }}>
                                    {identity.address || 'No detectada'}
                                </Typography>
                            </Box>
                        </Stack>

                        <Button
                            variant="solid"
                            color="primary"
                            size="lg"
                            onClick={onClose}
                            sx={{ mt: 1, borderRadius: 'md', fontWeight: 600 }}
                        >
                            Cerrar Identidad
                        </Button>
                    </Stack>
                </DialogContent>
            </ModalDialog>
        </Modal>
    );
};
