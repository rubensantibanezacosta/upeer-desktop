import React, { useState } from 'react';
import { Alert, Box, Button, Stack, Textarea, Typography } from '@mui/joy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { EnrollmentCodeCard } from '../enrollment/EnrollmentCodeCard.js';

interface LinkDeviceStepProps {
    onBack: () => void;
    onLinked: () => void;
}

type Phase = 'invite' | 'request' | 'response';

export const LinkDeviceStep: React.FC<LinkDeviceStepProps> = ({ onBack, onLinked }) => {
    const [phase, setPhase] = useState<Phase>('invite');
    const [inviteCode, setInviteCode] = useState('');
    const [requestCode, setRequestCode] = useState('');
    const [expiresAt, setExpiresAt] = useState<number | undefined>(undefined);
    const [responseCode, setResponseCode] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const startEnrollment = async () => {
        setBusy(true);
        setError('');
        try {
            const result = await window.upeer.beginEnrollment(inviteCode.trim());
            if (!result.success || !result.requestCode) {
                setError(result.error || 'La invitación no es válida.');
                return;
            }
            setRequestCode(result.requestCode);
            setExpiresAt(result.expiresAt);
            setPhase('request');
        } catch {
            setError('La invitación no es válida.');
        } finally {
            setBusy(false);
        }
    };

    const finish = async () => {
        setBusy(true);
        setError('');
        try {
            const result = await window.upeer.finishEnrollment(responseCode.trim());
            if (!result.success) {
                setError(result.error || 'El certificado no es válido.');
                return;
            }
            onLinked();
        } catch {
            setError('El certificado no es válido.');
        } finally {
            setBusy(false);
        }
    };

    const cancel = async () => {
        await window.upeer.cancelEnrollment();
        onBack();
    };

    return (
        <Stack spacing={2.5}>
            <Stack direction="row" spacing={1} alignItems="center">
                <Button size="sm" variant="plain" color="neutral" startDecorator={<ArrowBackIcon />} onClick={() => void cancel()}>
                    Volver
                </Button>
                <Typography level="title-lg">Vincular este dispositivo</Typography>
            </Stack>

            {phase === 'invite' && (
                <Stack spacing={2}>
                    <Alert variant="soft" color="primary" startDecorator={<QrCodeScannerIcon />} sx={{ borderRadius: '18px' }}>
                        Este dispositivo se unirá a una cuenta existente sin guardar su frase semilla: solo recibirá un certificado firmado por la cuenta.
                    </Alert>
                    <Box>
                        <Typography level="title-sm" sx={{ mb: 0.5 }}>Código de invitación</Typography>
                        <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 1 }}>
                            Escanéalo desde el dispositivo que ya tiene la cuenta o pega el código aquí.
                        </Typography>
                        <Textarea
                            minRows={3}
                            maxRows={6}
                            value={inviteCode}
                            placeholder="Pega la invitación"
                            onChange={(event) => setInviteCode(event.target.value)}
                            sx={{ fontFamily: 'monospace', fontSize: '12px' }}
                        />
                    </Box>
                    <Button
                        size="lg"
                        loading={busy}
                        disabled={inviteCode.trim().length === 0}
                        onClick={() => void startEnrollment()}
                    >
                        Continuar
                    </Button>
                </Stack>
            )}

            {phase === 'request' && (
                <Stack spacing={2}>
                    <EnrollmentCodeCard
                        title="1. Envía esta solicitud al dispositivo autorizador"
                        description="Muéstrala o cópiala en el dispositivo que tiene la cuenta para que emita tu certificado."
                        code={requestCode}
                        expiresAt={expiresAt}
                    />
                    <Box>
                        <Typography level="title-sm" sx={{ mb: 0.5 }}>2. Respuesta del dispositivo autorizador</Typography>
                        <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 1 }}>
                            Pega el código que te devuelva para instalar el certificado de este dispositivo.
                        </Typography>
                        <Textarea
                            minRows={3}
                            maxRows={6}
                            value={responseCode}
                            placeholder="Pega la respuesta"
                            onChange={(event) => setResponseCode(event.target.value)}
                            sx={{ fontFamily: 'monospace', fontSize: '12px' }}
                        />
                    </Box>
                    <Button
                        size="lg"
                        loading={busy}
                        disabled={responseCode.trim().length === 0}
                        onClick={() => void finish()}
                    >
                        Instalar certificado
                    </Button>
                </Stack>
            )}

            {error && <Alert color="danger" variant="soft" sx={{ borderRadius: '14px' }}>{error}</Alert>}
        </Stack>
    );
};
