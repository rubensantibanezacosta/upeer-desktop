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
    Alert
} from '@mui/joy';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CloseIcon from '@mui/icons-material/Close';
import LockIcon from '@mui/icons-material/Lock';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ShieldIcon from '@mui/icons-material/Shield';

interface SecurityModalProps {
    open: boolean;
    onClose: () => void;
    contactName: string;
    contactPublicKey: string;
    myPublicKey: string;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
    open,
    onClose,
    contactName,
    contactPublicKey,
    myPublicKey
}) => {

    // BUG DY fix: computar el safety number con SHA-256 (SubtleCrypto del renderer)
    // en lugar de exponer el prefijo bruto de las claves públicas.
    const [safetyNumber, setSafetyNumber] = useState('…');

    useEffect(() => {
        if (!myPublicKey || !contactPublicKey) return;
        const sorted = [myPublicKey, contactPublicKey].sort().join('');
        const encoder = new TextEncoder();
        crypto.subtle.digest('SHA-256', encoder.encode(sorted)).then(hashBuf => {
            const hex = Array.from(new Uint8Array(hashBuf))
                .map(b => b.toString(16).padStart(2, '0')).join('');
            // Mostrar los primeros 40 hex chars agrupados en bloques de 5
            setSafetyNumber(hex.slice(0, 40).match(/.{1,5}/g)?.join(' ') || hex);
        });
    }, [myPublicKey, contactPublicKey]);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <Modal open={open} onClose={onClose}>
            <ModalDialog sx={{ width: 500, maxWidth: '95vw', borderRadius: 'xl', boxShadow: 'lg', p: 0, overflow: 'hidden' }}>
                <Box sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'background.surface'
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LockIcon color="primary" />
                        <DialogTitle sx={{ m: 0 }}>Cifrado de Extremo a Extremo</DialogTitle>
                    </Box>
                    <IconButton variant="plain" color="neutral" size="sm" onClick={onClose}>
                        <CloseIcon />
                    </IconButton>
                </Box>
                <Divider />
                <DialogContent sx={{ p: 4, textAlign: 'center' }}>
                    <Stack spacing={3} alignItems="center">
                        <Box sx={{
                            width: 80, height: 80,
                            borderRadius: '50%',
                            backgroundColor: 'primary.softBg',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            mb: 1
                        }}>
                            <VerifiedUserIcon sx={{ fontSize: '48px', color: 'primary.main' }} />
                        </Box>

                        <Typography level="body-md">
                            Los mensajes enviados a <b>{contactName}</b> están cifrados con algoritmos de grado militar. Nadie fuera de este chat puede leerlos.
                        </Typography>

                        <Alert
                            variant="soft"
                            color="success"
                            startDecorator={<LockIcon />}
                            sx={{ borderRadius: 'md', py: 1.5 }}
                        >
                            Esta conversación utiliza X25519, Salsa20 y Poly1305.
                        </Alert>

                        <Box sx={{ width: '100%' }}>
                            <Typography level="body-xs" sx={{ fontWeight: 600, mb: 1, textTransform: 'uppercase', opacity: 0.7 }}>
                                Número de Seguridad (Fingerprint)
                            </Typography>
                            <Box sx={{
                                backgroundColor: 'background.level1',
                                p: 2,
                                borderRadius: 'lg',
                                border: '1px dashed',
                                borderColor: 'divider',
                                position: 'relative'
                            }}>
                                <Typography level="h4" sx={{
                                    fontFamily: 'monospace',
                                    letterSpacing: '0.1em',
                                    fontSize: '18px',
                                    fontWeight: 700,
                                    color: 'text.primary'
                                }}>
                                    {safetyNumber}
                                </Typography>
                                <Tooltip title="Copiar código" variant="soft">
                                    <IconButton
                                        size="sm"
                                        variant="plain"
                                        sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}
                                        onClick={() => copyToClipboard(safetyNumber)}
                                    >
                                        <ContentCopyIcon />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                            <Typography level="body-xs" sx={{ mt: 2, opacity: 0.6 }}>
                                Verifica que este código sea idéntico en el dispositivo de <b>{contactName}</b> para asegurar que no hay intermediarios (MitM).
                            </Typography>
                        </Box>

                        <Divider sx={{ width: '100%' }}>Resiliencia P2P</Divider>

                        <Alert
                            variant="soft"
                            color="primary"
                            startDecorator={<ShieldIcon />}
                            sx={{ borderRadius: 'md', py: 1.5, textAlign: 'left' }}
                        >
                            <Box>
                                <Typography level="title-sm" color="primary">Bóveda Social Activa</Typography>
                                <Typography level="body-xs">
                                    Si tu contacto está desconectado, tus amigos de confianza guardarán tus mensajes de forma cifrada hasta que el destinatario regrese. <b>Nadie</b> (ni tus amigos) puede leer el contenido.
                                </Typography>
                            </Box>
                        </Alert>

                        <Divider sx={{ width: '100%' }}>Privacidad por Diseño</Divider>

                        <Alert
                            variant="plain"
                            color="neutral"
                            startDecorator={<WarningAmberIcon />}
                            sx={{ fontSize: '13px', textAlign: 'left', p: 0 }}
                        >
                            upeer no almacena tus llaves privadas. Todo el proceso de cifrado ocurre localmente en tu dispositivo.
                        </Alert>

                        <Button
                            fullWidth
                            variant="solid"
                            color="primary"
                            size="lg"
                            onClick={onClose}
                            sx={{ borderRadius: 'md', fontWeight: 600 }}
                        >
                            Entendido
                        </Button>
                    </Stack>
                </DialogContent>
            </ModalDialog>
        </Modal>
    );
};
