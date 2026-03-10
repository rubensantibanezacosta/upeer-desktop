import React, { useEffect, useState } from 'react';
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
    Tooltip,
    LinearProgress
} from '@mui/joy';
import ShieldIcon from '@mui/icons-material/Shield';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CloseIcon from '@mui/icons-material/Close';
import StorageIcon from '@mui/icons-material/Storage';

interface IdentityModalProps {
    open: boolean;
    onClose: () => void;
    identity: {
        address: string | null;
        upeerId: string;
        publicKey: string;
    } | null;
}

export const IdentityModal: React.FC<IdentityModalProps> = ({ open, onClose, identity }) => {
    const [vaultStats, setVaultStats] = useState<{ count: number, sizeBytes: number } | null>(null);

    useEffect(() => {
        if (open) {
            window.upeer.getVaultStats().then(setVaultStats);
        }
    }, [open]);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    if (!identity) return null;

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatFullIdentity = (id: string, addr: string | null) => {
        if (!addr) return `${id}@?`;
        let normalizedAddr = addr;
        const parts = addr.split(':');
        if (parts.length === 7 && !addr.startsWith('200:')) {
            normalizedAddr = '200:' + addr;
        }
        return `${id}@${normalizedAddr}`;
    };

    const fullIdentity = formatFullIdentity(identity.upeerId, identity.address);

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
                        <DialogTitle sx={{ m: 0 }}>Mi Identidad uPeer</DialogTitle>
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
                        </Box>

                        <Box sx={{
                            p: 2,
                            borderRadius: 'lg',
                            backgroundColor: 'primary.softBg',
                            border: '1px solid',
                            borderColor: 'primary.softBorder',
                        }}>
                            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                                <StorageIcon color="primary" sx={{ fontSize: '20px' }} />
                                <Typography level="title-sm">Bóveda de Amigos</Typography>
                            </Stack>
                            <Typography level="body-xs" sx={{ mb: 2, opacity: 0.8 }}>
                                Espacio cedido para guardar mensajes de tus contactos mientras están desconectados.
                            </Typography>

                            <Stack spacing={1}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography level="body-xs">Uso actual</Typography>
                                    <Typography level="body-xs" sx={{ fontWeight: 600 }}>
                                        {vaultStats ? formatBytes(vaultStats.sizeBytes) : '...'}
                                    </Typography>
                                </Stack>
                                <LinearProgress
                                    determinate
                                    value={vaultStats ? Math.min((vaultStats.sizeBytes / (100 * 1024 * 1024)) * 100, 100) : 0}
                                    size="sm"
                                    sx={{ borderRadius: 'sm' }}
                                />
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography level="body-xs">Límite de cortesía: 1 GB</Typography>
                                    <Typography level="body-xs">{vaultStats ? `${vaultStats.count} mensajes` : '...'}</Typography>
                                </Stack>
                            </Stack>
                        </Box>

                        <Divider>Detalles Técnicos</Divider>

                        <Stack spacing={2}>
                            <Box>
                                <Typography level="body-xs" sx={{ fontWeight: 600, mb: 0.5, opacity: 0.7 }}>
                                    upeer ID
                                </Typography>
                                <Typography level="body-sm" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', backgroundColor: 'background.level1', p: 1, borderRadius: 'sm', fontSize: '12px' }}>
                                    {identity.upeerId}
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
                            Listo
                        </Button>
                    </Stack>
                </DialogContent>
            </ModalDialog>
        </Modal>
    );
};

