import React, { useState } from 'react';
import { Box, Typography, Input, Button, Stack, Sheet } from '@mui/joy';
import LockRoundedIcon from '@mui/icons-material/LockRounded';

interface AppLockProps {
    onUnlock: () => void;
}

export const AppLock: React.FC<AppLockProps> = ({ onUnlock }) => {
    const [pin, setPin] = useState(['', '', '', '']);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

    React.useEffect(() => {
        // Autofocus the first input shortly after mounting
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
                onUnlock();
            } else {
                setError('PIN incorrecto. Inténtalo de nuevo.');
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
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        mx: 'auto',
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        bgcolor: 'primary.softBg',
                        alignItems: 'center'
                    }}
                >
                    <LockRoundedIcon sx={{ fontSize: '1.5rem', color: 'primary.solidBg' }} />
                </Box>

                <Box>
                    <Typography level="h4" sx={{ fontWeight: 'xl' }}>uPeer</Typography>
                    <Typography level="body-sm" color="neutral" sx={{ mt: 0.5 }}>
                        Introduce tu PIN de acceso para continuar
                    </Typography>
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
                                color={error ? 'danger' : 'primary'}
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
                </Stack>
            </Box>
        </Sheet>
    );
};
