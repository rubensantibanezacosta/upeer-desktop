import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, DialogActions, DialogContent, DialogTitle, IconButton, Modal, ModalDialog, Stack, Tooltip, Typography } from '@mui/joy';
import DeleteIcon from '@mui/icons-material/Delete';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import { sectionCardSx } from './shared.js';

export interface AuthorizedDevice {
    deviceId: string;
    devicePublicKey: string;
    platform?: string;
    capabilities?: string[];
    authorizedAt: number;
    expiresAt: number;
    epoch: number;
}

export const AuthorizedDeviceList: React.FC = () => {
    const [devices, setDevices] = useState<AuthorizedDevice[]>([]);
    const [epoch, setEpoch] = useState<number | null>(null);
    const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [pending, setPending] = useState<AuthorizedDevice | null>(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const result = await window.upeer.getAuthorizedDevices();
            setDevices(orderDevices(result.devices, result.localDeviceId ?? null));
            setEpoch(result.epoch);
            setLocalDeviceId(result.localDeviceId ?? null);
            setError('');
        } catch {
            setError('No se pudo leer el registro de dispositivos autorizados.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        return window.upeer.onAuthorizedDevicesChanged(() => {
            void load();
        });
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
            setPending(null);
            await load();
        } catch {
            setError('No se pudo revocar el dispositivo.');
        } finally {
            setBusy(null);
        }
    };

    const confirm = async () => {
        const device = pending;
        if (!device) return;
        await revoke(device.deviceId);
    };

    return (
        <Stack spacing={1.25} sx={{ ...sectionCardSx, px: 2.5, py: 2.5 }}>
            <Stack direction="row" spacing={1} alignItems="center">
                <VerifiedUserIcon sx={{ fontSize: '15px', opacity: 0.45 }} />
                <Typography level="body-xs" sx={{ flexGrow: 1, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
                    Autorizados en esta cuenta
                </Typography>
                {epoch !== null && <Chip size="sm" variant="soft">epoch {epoch}</Chip>}
            </Stack>
            <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                Pueden usar tu cuenta sin tu frase semilla. Revocar uno le quita el acceso sin tocar el resto.
            </Typography>

            {loading && devices.length === 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size="sm" />
                </Box>
            )}

            {!loading && devices.length === 0 && (
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Todavía no hay dispositivos autorizados en esta cuenta.
                </Typography>
            )}

            {devices.map((device) => {
                const current = device.deviceId === localDeviceId;
                return (
                    <Box
                        key={device.deviceId}
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.25,
                            px: 1.5,
                            py: 1.5,
                            borderRadius: '12px',
                            backgroundColor: 'background.level1',
                        }}
                    >
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
                                <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                                    {platformLabel(device.platform)}
                                </Typography>
                                {current && (
                                    <Chip size="sm" variant="soft" color="primary" sx={{ fontSize: '10px', fontWeight: 700, height: 18 }}>
                                        ESTE DISPOSITIVO
                                    </Chip>
                                )}
                            </Stack>
                            <Typography level="body-xs" sx={{ fontFamily: 'monospace', color: 'text.tertiary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {device.deviceId}
                            </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                            <Typography level="body-xs" sx={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.06em', opacity: 0.5 }}>
                                VINCULADO
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                                {authorizedLabel(device.authorizedAt)}
                            </Typography>
                        </Box>
                        {current ? null : (
                            <Tooltip title="Revocar dispositivo" variant="soft" size="sm">
                                <IconButton
                                    size="sm"
                                    color="danger"
                                    variant="plain"
                                    loading={busy === device.deviceId}
                                    onClick={() => setPending(device)}
                                >
                                    <DeleteIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                );
            })}

            {error && <Alert color="warning" variant="soft" size="sm">{error}</Alert>}
            <Box>
                <Button size="sm" variant="plain" color="neutral" onClick={() => void load()}>Actualizar</Button>
            </Box>

            <Modal open={pending !== null} onClose={() => (busy ? undefined : setPending(null))}>
                <ModalDialog size="sm" sx={{ maxWidth: 420 }}>
                    <DialogTitle>Revocar dispositivo</DialogTitle>
                    <DialogContent>
                        <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                            {pending ? platformLabel(pending.platform) : ''} dejará de poder usar tu cuenta y perderá el acceso a tus
                            conversaciones en cuanto se conecte.
                        </Typography>
                        <Typography level="body-xs" sx={{ mt: 1, fontFamily: 'monospace', color: 'text.tertiary', wordBreak: 'break-all' }}>
                            {pending?.deviceId ?? ''}
                        </Typography>
                    </DialogContent>
                    <DialogActions>
                        <Button variant="plain" color="neutral" disabled={busy !== null} onClick={() => setPending(null)}>
                            Cancelar
                        </Button>
                        <Button color="danger" loading={busy !== null} onClick={() => void confirm()}>
                            Revocar acceso
                        </Button>
                    </DialogActions>
                </ModalDialog>
            </Modal>
        </Stack>
    );
};

function orderDevices(devices: AuthorizedDevice[], localDeviceId: string | null): AuthorizedDevice[] {
    return [...devices].sort((left, right) => {
        if (left.deviceId === localDeviceId) return -1;
        if (right.deviceId === localDeviceId) return 1;
        return left.authorizedAt - right.authorizedAt;
    });
}

function authorizedLabel(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '';
    const date = new Date(value);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString('es-ES', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

function platformLabel(platform?: string): string {
    if (!platform) return 'Dispositivo';
    const normalized = platform.toLowerCase();
    if (normalized.includes('android')) return 'Android';
    if (normalized.includes('ios')) return 'iOS';
    if (normalized.includes('linux')) return 'Linux';
    if (normalized.includes('darwin') || normalized.includes('mac')) return 'macOS';
    if (normalized.includes('win')) return 'Windows';
    return platform;
}
