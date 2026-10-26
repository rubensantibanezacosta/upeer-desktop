import React, { useState } from 'react';
import {
    Modal,
    ModalDialog,
    DialogTitle,
    DialogContent,
    Stack,
    FormControl,
    FormLabel,
    Input,
    Button,
    Typography,
    Alert,
    Box,
    IconButton,
    Divider
} from '@mui/joy';
import { UserPlus, Info, X, ScanLine } from 'lucide-react';
import { isYggdrasilAddress } from '../../utils/yggdrasilAddress.js';
import { parseContactQrPayload } from '../../utils/contactQr.js';
import { QrScannerModal } from './QrScannerModal.js';

interface AddContactModalProps {
    open: boolean;
    onClose: () => void;
    onAdd: (id: string, name: string) => void;
}

export const AddContactModal: React.FC<AddContactModalProps> = ({ open, onClose, onAdd }) => {
    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [scanning, setScanning] = useState(false);

    const applyScanned = (raw: string) => {
        const result = parseContactQrPayload(raw);
        setScanning(false);
        if ('error' in result) {
            setError(result.error);
            return;
        }
        setId(`${result.upeerId}@${result.address}`);
        setError('');
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        // Único formato válido: UPeerID@IP (separador @)
        const separator = '@';
        if (!id.includes(separator)) {
            setError('Formato inválido. Usa: UPeerID@IP (ej: fc33aa0e...@200:7704:49e5:...)');
            return;
        }

        const [upeerId, ip] = id.split(separator);
        if (!upeerId || !ip) {
            setError('Formato incompleto. Asegúrate de incluir el ID y la IP.');
            return;
        }

        const normalizedIp = ip.trim();
        if (!isYggdrasilAddress(normalizedIp)) {
            setError('Dirección de red inválida. Debe ser una dirección IPv6 válida de la red.');
            return;
        }

        // Construir el formato final para el backend (ID@IP)
        const finalAddress = `${upeerId}@${normalizedIp}`;

        if (upeerId && name) {
            onAdd(finalAddress, name);
            setId('');
            setName('');
            setError('');
            onClose();
        }
    };

    return (
        <>
        <Modal open={open} onClose={onClose}>
            <ModalDialog sx={{ width: 450, maxWidth: '95vw', borderRadius: 'xl', boxShadow: 'lg', p: 0, overflow: 'hidden' }}>
                <Box sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'background.surface'
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <UserPlus style={{ fontSize: 20, color: 'var(--joy-palette-primary-400)' }} />
                        <DialogTitle sx={{ m: 0 }}>Nueva Conexión Segura</DialogTitle>
                    </Box>
                    <IconButton variant="plain" color="neutral" size="sm" onClick={onClose}>
                        <X style={{ fontSize: 20 }} />
                    </IconButton>
                </Box>
                <Divider />
                <DialogContent sx={{ p: 3 }}>
                    <Typography level="body-sm" sx={{ mb: 2.5 }}>
                        Para añadir a alguien, necesitas su <b>Identidad upeer</b> completa en formato ID@IP. Puedes pegartela o escanear el QR que muestra en Perfil → Mostrar QR. Una vez conectado, el sistema DHT mantendrá actualizada su dirección automáticamente, incluso si cambia.
                    </Typography>

                    <Button
                        variant="outlined"
                        color="neutral"
                        startDecorator={<ScanLine style={{ fontSize: 16 }} />}
                        onClick={() => setScanning(true)}
                        fullWidth
                        sx={{ mb: 2.5 }}
                    >
                        Escanear QR del contacto
                    </Button>

                    {error && (
                        <Alert
                            variant="soft"
                            color="danger"
                            startDecorator={<Info style={{ fontSize: 16 }} />}
                            sx={{ mb: 2.5, py: 1 }}
                        >
                            {error}
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit}>
                        <Stack spacing={2.5}>
                            <FormControl required>
                                <FormLabel sx={{ fontWeight: 600 }}>Identidad upeer (ID@IP)</FormLabel>
                                <Input
                                    autoFocus
                                    placeholder="fc33aa0e...@200:7704:49e5:b4cd:7910:2191:2574:351b"
                                    value={id}
                                    onChange={(e) => {
                                        setId(e.target.value);
                                        if (error) setError('');
                                    }}
                                    sx={{
                                        fontFamily: 'monospace',
                                        fontSize: '13px',
                                        backgroundColor: 'background.level1',
                                        '&:focus-within': {
                                            backgroundColor: 'background.surface'
                                        }
                                    }}
                                />
                                <Typography level="body-xs" sx={{ mt: 0.5, opacity: 0.7 }}>
                                    Ejemplo válido:
                                    • fc33aa0e...@200:7704:49e5:b4cd:7910:2191:2574:351b
                                </Typography>
                            </FormControl>

                            <FormControl required>
                                <FormLabel sx={{ fontWeight: 600 }}>Alias del Contacto</FormLabel>
                                <Input
                                    placeholder="Nombre o apodo para identificarlo"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    sx={{
                                        backgroundColor: 'background.level1',
                                        '&:focus-within': {
                                            backgroundColor: 'background.surface'
                                        }
                                    }}
                                />
                            </FormControl>

                            <Button
                                type="submit"
                                variant="solid"
                                color="primary"
                                size="lg"
                                fullWidth
                                sx={{ mt: 1, borderRadius: 'md', fontWeight: 600 }}
                            >
                                Emparejar y Conectar
                            </Button>
                        </Stack>
                    </form>
                </DialogContent>
            </ModalDialog>
        </Modal>
        <QrScannerModal open={scanning} onClose={() => setScanning(false)} onDetected={applyScanned} />
        </>
    );
};
