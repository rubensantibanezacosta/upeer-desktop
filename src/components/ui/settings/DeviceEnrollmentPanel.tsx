import React, { useState } from 'react';
import { Alert, Box, Button, Stack, Textarea, Typography } from '@mui/joy';
import AddLinkIcon from '@mui/icons-material/AddLink';
import VerifiedIcon from '@mui/icons-material/Verified';
import { EnrollmentCodeCard } from '../enrollment/EnrollmentCodeCard.js';

interface InviteState {
    code: string;
    inviteId: string;
    expiresAt: number;
}

interface IssuedState {
    code: string;
    deviceId: string;
    expiresAt: number;
}

export const DeviceEnrollmentPanel: React.FC = () => {
    const [invite, setInvite] = useState<InviteState | null>(null);
    const [requestCode, setRequestCode] = useState('');
    const [issued, setIssued] = useState<IssuedState | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const createInvite = async () => {
        setBusy(true);
        setError('');
        setIssued(null);
        try {
            const result = await window.upeer.createEnrollmentInvite();
            if (!result.success || !result.code || !result.inviteId || !result.expiresAt) {
                setError(result.error || 'No se pudo crear la invitación.');
                setInvite(null);
                return;
            }
            setInvite({ code: result.code, inviteId: result.inviteId, expiresAt: result.expiresAt });
        } catch {
            setError('No se pudo crear la invitación.');
        } finally {
            setBusy(false);
        }
    };

    const authorize = async () => {
        if (!invite) return;
        setBusy(true);
        setError('');
        try {
            const result = await window.upeer.completeEnrollment(requestCode.trim());
            if (!result.success || !result.code || !result.deviceId) {
                setError(result.error || 'La solicitud no se pudo autorizar.');
                return;
            }
            setIssued({ code: result.code, deviceId: result.deviceId, expiresAt: result.expiresAt ?? invite.expiresAt });
            setRequestCode('');
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
        setError('');
    };

    return (
        <Box sx={{ px: 2.5, py: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                <AddLinkIcon sx={{ fontSize: '15px', opacity: 0.45 }} />
                <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
                    Vincular un dispositivo nuevo
                </Typography>
            </Box>
            <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.6, mb: 1.5 }}>
                El dispositivo nuevo entra en la cuenta sin recibir la frase semilla: solo obtiene un certificado firmado por esta cuenta.
            </Typography>

            {!invite && (
                <Box>
                    <Button
                        startDecorator={<AddLinkIcon />}
                        loading={busy}
                        onClick={() => void createInvite()}
                    >
                        Generar invitación
                    </Button>
                </Box>
            )}

            {invite && !issued && (
                <Stack spacing={2}>
                    <EnrollmentCodeCard
                        title="1. Invitación para el dispositivo nuevo"
                        description="Escanea este código en el dispositivo que quieres vincular. Caduca en pocos minutos y solo se puede usar una vez."
                        code={invite.code}
                        expiresAt={invite.expiresAt}
                    />
                    <Box>
                        <Typography level="title-sm" sx={{ mb: 0.5 }}>2. Código de solicitud</Typography>
                        <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 1 }}>
                            Pega aquí el código que muestra el dispositivo nuevo después de leer la invitación.
                        </Typography>
                        <Textarea
                            minRows={3}
                            maxRows={6}
                            value={requestCode}
                            placeholder="Pega el código de solicitud"
                            onChange={(event) => setRequestCode(event.target.value)}
                            sx={{ fontFamily: 'monospace', fontSize: '12px' }}
                        />
                    </Box>
                    <Stack direction="row" spacing={1}>
                        <Button
                            startDecorator={<VerifiedIcon />}
                            loading={busy}
                            disabled={requestCode.trim().length === 0}
                            onClick={() => void authorize()}
                        >
                            Autorizar dispositivo
                        </Button>
                        <Button variant="plain" color="neutral" onClick={reset}>Cancelar</Button>
                    </Stack>
                </Stack>
            )}

            {issued && (
                <Stack spacing={2}>
                    <EnrollmentCodeCard
                        title="3. Respuesta para el dispositivo nuevo"
                        description="Escanea o pega este código en el dispositivo nuevo para instalar su certificado."
                        code={issued.code}
                        expiresAt={issued.expiresAt}
                    />
                    <Alert color="success" variant="soft" size="sm">
                        Certificado emitido para {issued.deviceId.slice(0, 16)}…
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
