import React, { useState } from 'react';
import { Box, Typography, Input, Button, Stack, Sheet, Avatar } from '@mui/joy';
import LogoutIcon from '@mui/icons-material/Logout';
import { useChatStore } from '../../store/useChatStore.js';

interface AppLockProps {
    onUnlock: () => void;
    onTooManyAttempts?: () => void;
}

const MAX_PIN_ATTEMPTS = 10;

export const AppLock: React.FC<AppLockProps> = ({ onUnlock, onTooManyAttempts }) => {
    const [pin, setPin] = useState(['', '', '', '']);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [failedAttempts, setFailedAttempts] = useState(0);
    const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);
    const myIdentity = useChatStore((state) => state.myIdentity);
    const remainingAttempts = MAX_PIN_ATTEMPTS - failedAttempts;
    const isLowAttemptsWarning = remainingAttempts <= 5;

    React.useEffect(() => {
        const timer = setTimeout(() => {
            inputRefs.current[0]?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    const handleUnlock = async (currentPin: string) => {
        if (currentPin.length < 4) {
            setError('Introduce el PIN completo');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const isValid = await window.upeer.verifyPin({ pin: currentPin });
            if (isValid) {
                setFailedAttempts(0);
                onUnlock();
            } else {
                const nextFailedAttempts = failedAttempts + 1;
                const updatedRemainingAttempts = MAX_PIN_ATTEMPTS - nextFailedAttempts;

                if (updatedRemainingAttempts <= 0) {
                    setError('Has agotado los intentos de PIN. Vuelve a iniciar sesión.');
                    setPin(['', '', '', '']);
                    onTooManyAttempts?.();
                    return;
                }

                setFailedAttempts(nextFailedAttempts);
                setError(`PIN incorrecto. Te quedan ${updatedRemainingAttempts} intentos.`);
                setPin(['', '', '', '']);
                inputRefs.current[0]?.focus();
            }
        } catch (err) {
            setError('Error al verificar el PIN');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (val: string, index: number) => {
        const digit = val.replace(/\D/g, '').slice(-1);
        const newPin = [...pin];
        newPin[index] = digit;
        setPin(newPin);

        if (digit && index < 3) {
            inputRefs.current[index + 1]?.focus();
        }

        if (newPin.every(d => d !== '')) {
            handleUnlock(newPin.join(''));
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        if (e.key === 'Backspace' && !pin[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    return (
        <Sheet
            sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'background.body',
            }}
        >
            <Box
                sx={{
                    width: 340,
                    p: 4,
                    borderRadius: 'md',
                    bgcolor: 'background.surface',
                    border: '1px solid',
                    borderColor: 'divider',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                }}
            >
                <Avatar
                    size="lg"
                    src={myIdentity?.avatar || undefined}
                    variant="soft"
                    sx={{ width: 64, height: 64, mx: 'auto', borderRadius: 'md', fontSize: '2rem' }}
                >
                    {(myIdentity?.alias || 'U')[0].toUpperCase()}
                </Avatar>

                <Box>
                    <Typography level="h4" sx={{ fontWeight: 'xl' }}>{myIdentity?.alias || 'uPeer'}</Typography>
                    <Typography level="body-sm" color="neutral" sx={{ mt: 0.5 }}>
                        Introduce tu PIN de acceso para continuar
                    </Typography>
                    <Typography level="body-xs" color={isLowAttemptsWarning ? 'warning' : 'neutral'} sx={{ mt: 1, fontWeight: isLowAttemptsWarning ? 700 : 500 }}>
                        Intentos restantes: {remainingAttempts}
                    </Typography>
                    {isLowAttemptsWarning && remainingAttempts > 0 && (
                        <Typography level="body-xs" color="warning" sx={{ mt: 0.75, fontWeight: 700 }}>
                            Atención: te quedan 5 intentos o menos antes de volver al login.
                        </Typography>
                    )}
                </Box>

                <Stack gap={3}>
                    <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
                        {pin.map((digit, i) => (
                            <Input
                                key={i}
                                slotProps={{
                                    input: {
                                        ref: (el: HTMLInputElement | null) => {
                                            inputRefs.current[i] = el;
                                        },
                                        style: { textAlign: 'center', fontSize: '1.5rem', fontWeight: 'bold' }
                                    }
                                }}
                                type="password"
                                variant="outlined"
                                color={error ? 'danger' : isLowAttemptsWarning ? 'warning' : 'primary'}
                                sx={{ width: 56, height: 64 }}
                                value={digit}
                                onChange={(e) => handleChange(e.target.value, i)}
                                onKeyDown={(e) => handleKeyDown(e, i)}
                                autoComplete="off"
                            />
                        ))}
                    </Box>

                    {error && (
                        <Typography level="body-xs" color="danger">
                            {error}
                        </Typography>
                    )}

                    <Button
                        variant="solid"
                        color="primary"
                        loading={loading}
                        onClick={() => handleUnlock(pin.join(''))}
                        fullWidth
                    >
                        Desbloquear
                    </Button>

                    <Button
                        variant="plain"
                        color="neutral"
                        startDecorator={<LogoutIcon />}
                        onClick={async () => {
                            if (confirm('Se borrarán todos tus datos locales para iniciar sesión con otra cuenta. ¿Estás seguro?')) {
                                await window.upeer.deleteIdentity();
                            }
                        }}
                        fullWidth
                        sx={{ mt: -1 }}
                    >
                        Iniciar sesión con otra cuenta
                    </Button>
                </Stack>
            </Box>
        </Sheet>
    );
};
