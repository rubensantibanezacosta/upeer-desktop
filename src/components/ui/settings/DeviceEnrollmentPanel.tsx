import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Textarea, Typography } from '@mui/joy';
import AddLinkIcon from '@mui/icons-material/AddLink';
import VerifiedIcon from '@mui/icons-material/Verified';
import { EnrollmentCodeCard } from '../enrollment/EnrollmentCodeCard.js';
import { sectionCardSx } from './shared.js';

interface InviteState {
    code: string;
    inviteId: string;
    expiresAt: number;
}

interface IssuedState {
    deviceId: string;
    expiresAt: number;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 180_000;

export const DeviceEnrollmentPanel: React.FC<{ onEnrolled?: () => void }> = ({ onEnrolled }) => {
    const [invite, setInvite] = useState<InviteState | null>(null);
    const [issued, setIssued] = useState<IssuedState | null>(null);
    const [requestCode, setRequestCode] = useState('');
    const [manualResponse, setManualResponse] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const knownDevices = useRef<Set<string>>(new Set());
    const onEnrolledRef = useRef(onEnrolled);
    onEnrolledRef.current = onEnrolled;

    const snapshotDevices = useCallback(async () => {
        const result = await window.upeer.getAuthorizedDevices();
        knownDevices.current = new Set(result.devices.map((device) => device.deviceId));
    }, []);

    useEffect(() => {
        if (!invite || issued || manualResponse) return;
        let cancelled = false;
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        const timer = setInterval(() => {
            if (cancelled || Date.now() > deadline) {
                clearInterval(timer);
                return;
            }
            void window.upeer.getAuthorizedDevices().then((result) => {
                if (cancelled) return;
                const fresh = result.devices.find((device) => !knownDevices.current.has(device.deviceId));
                if (!fresh) return;
                clearInterval(timer);
                setIssued({ deviceId: fresh.deviceId, expiresAt: fresh.expiresAt });
                setInvite(null);
                setError('');
                onEnrolledRef.current?.();
            }).catch(() => {
                clearInterval(timer);
            });
        }, POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [invite, issued, manualResponse]);

    const createInvite = async () => {
        setBusy(true);
        setError('');
        setIssued(null);
        try {
            await snapshotDevices();
            const result = await window.upeer.createEnrollmentInvite();
            if (!result.success || !result.code || !result.inviteId || !result.expiresAt) {
                setError(result.error || 'No se pudo crear la invitación.');
                setInvite(null);
                return;
            }
            setInvite({ code: result.code, inviteId: result.inviteId, expiresAt: result.expiresAt });
            setRequestCode('');
            setManualResponse('');
        } catch {
            setError('No se pudo crear la invitación.');
        } finally {
            setBusy(false);
        }
    };

    const authorizeManually = async () => {
        setBusy(true);
        setError('');
        try {
            const result = await window.upeer.completeEnrollment(requestCode.trim());
            if (!result.success || !result.deviceId) {
                setError(result.error || 'La solicitud no se pudo autorizar.');
                return;
            }
            setManualResponse(result.code || '');
            setRequestCode('');
            onEnrolledRef.current?.();
        } catch {
            setError('La solicitud no se pudo autorizar.');
        } finally {
            setBusy(false);
        }
    };

    const reset = () => {
        setInvite(null);
        setIssued(null);
        setRequestCode('');
        setManualResponse('');
        setError('');
    };

    return (
        <Box sx={{ ...sectionCardSx, px: 2.5, py: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                <AddLinkIcon sx={{ fontSize: '15px', opacity: 0.45 }} />
                <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
                    Añadir otro dispositivo a mi cuenta
                </Typography>
            </Box>
            <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.6, mb: 1.5 }}>
                Genera la invitación y añade el dispositivo escaneando el QR o pegando el código en el otro equipo.
            </Typography>

            {!invite && !issued && (
                <Button startDecorator={<AddLinkIcon />} loading={busy} onClick={() => void createInvite()}>
                    Generar invitación
                </Button>
            )}

            {invite && !issued && (
                <Stack spacing={2}>
                    <Alert variant="soft" color="primary" size="sm">
                        Dos formas, la que te resulte más cómoda: escanear el QR desde el otro equipo o copiar el código y pegarlo allí.
                    </Alert>
                    <EnrollmentCodeCard
                        title="Invitación para el dispositivo nuevo"
                        description="Escanea el QR desde el móvil, o copia el código y pégalo en el otro equipo. Caduca en pocos minutos y solo sirve una vez."
                        code={invite.code}
                        expiresAt={invite.expiresAt}
                    />
                    {!manualResponse && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CircularProgress size="sm" />
                            <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                                Esperando a que el dispositivo nuevo se presente…
                            </Typography>
                        </Box>
                    )}
                    <Stack spacing={1.5}>
                        <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                            ¿El otro equipo no puede escanear? Pega aquí el código de solicitud que te muestre y pulsa autorizar.
                        </Typography>
                        <Textarea
                            minRows={3}
                            maxRows={6}
                            value={requestCode}
                            placeholder="Código de solicitud del dispositivo nuevo"
                            onChange={(event) => setRequestCode(event.target.value)}
                            sx={{ fontFamily: 'monospace', fontSize: '12px' }}
                        />
                        <Box>
                            <Button
                                startDecorator={<VerifiedIcon />}
                                loading={busy}
                                disabled={requestCode.trim().length === 0}
                                onClick={() => void authorizeManually()}
                            >
                                Autorizar con este código
                            </Button>
                        </Box>
                        {manualResponse && (
                            <EnrollmentCodeCard
                                title="Código de respuesta"
                                description="Cópialo y pégalo en el otro equipo para instalar su certificado."
                                code={manualResponse}
                                expiresAt={invite.expiresAt}
                            />
                        )}
                    </Stack>
                    <Box>
                        <Button variant="plain" color="neutral" onClick={reset}>Cancelar</Button>
                    </Box>
                </Stack>
            )}

            {issued && (
                <Stack spacing={1.5}>
                    <Alert color="success" variant="soft" size="sm" startDecorator={<VerifiedIcon />}>
                        Dispositivo añadido a tu cuenta ({issued.deviceId.slice(0, 16)}…)
                    </Alert>
                    <Box>
                        <Button variant="outlined" onClick={reset}>Terminar</Button>
                    </Box>
                </Stack>
            )}

            {error && <Alert color="danger" variant="soft" size="sm">{error}</Alert>}
        </Box>
    );
};
