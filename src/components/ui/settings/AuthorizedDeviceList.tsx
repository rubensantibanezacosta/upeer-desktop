import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@mui/joy';
import DeleteIcon from '@mui/icons-material/Delete';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

export interface AuthorizedDevice {
    deviceId: string;
    devicePublicKey: string;
    platform?: string;
    capabilities?: string[];
    authorizedAt: number;
    expiresAt: number;
    epoch: number;
}

const formatDate = (value: number) => new Date(value).toLocaleDateString();

export const AuthorizedDeviceList: React.FC = () => {
    const [devices, setDevices] = useState<AuthorizedDevice[]>([]);
    const [epoch, setEpoch] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const result = await window.upeer.getAuthorizedDevices();
            setDevices(result.devices);
            setEpoch(result.epoch);
            setError('');
        } catch {
            setError('No se pudo leer el registro de dispositivos autorizados.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const revoke = async (deviceId: string) => {
        setBusy(deviceId);
        try {
            const result = await window.upeer.revokeAuthorizedDevice(deviceId);
            if (!result.success) {
                setError(result.error || 'No se pudo revocar el dispositivo.');
                return;
            }
            setError(result.published === false ? 'Dispositivo revocado; el registro no se pudo publicar en la red.' : '');
            await load();
        } catch {
            setError('No se pudo revocar el dispositivo.');
        } finally {
            setBusy(null);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress size="sm" />
            </Box>
        );
    }

    return (
        <Stack spacing={1.5} sx={{ p: 2, borderRadius: '16px', border: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" spacing={1} alignItems="center">
                <VerifiedUserIcon sx={{ fontSize: 18, color: 'success.500' }} />
                <Typography level="title-sm" sx={{ flexGrow: 1 }}>Dispositivos autorizados</Typography>
                {epoch !== null && <Chip size="sm" variant="soft">epoch {epoch}</Chip>}
            </Stack>
            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                Cada dispositivo enrolado recibe un certificado firmado por la cuenta. Revocar uno lo expulsa del registro aunque conserve su certificado antiguo.
            </Typography>

            {devices.length === 0 && (
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Todavía no hay dispositivos enrolados sin la frase semilla.
                </Typography>
            )}

            {devices.map(device => (
                <Stack key={device.deviceId} direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography level="body-sm" sx={{ fontFamily: 'monospace' }}>
                            {device.deviceId.slice(0, 16)}…
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {device.platform || 'plataforma desconocida'} · autorizado {formatDate(device.authorizedAt)} · caduca {formatDate(device.expiresAt)}
                        </Typography>
                    </Box>
                    <Tooltip title="Revocar dispositivo" variant="soft" size="sm">
                        <IconButton
                            size="sm"
                            color="danger"
                            variant="plain"
                            loading={busy === device.deviceId}
                            onClick={() => void revoke(device.deviceId)}
                        >
                            <DeleteIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            ))}

            {error && <Alert color="warning" variant="soft" size="sm">{error}</Alert>}
            <Box>
                <Button size="sm" variant="plain" color="neutral" onClick={() => void load()}>Actualizar</Button>
            </Box>
        </Stack>
    );
};
