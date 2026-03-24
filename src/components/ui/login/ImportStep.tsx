import React, { useState } from 'react';
import { Alert, Box, Button, Chip, IconButton, LinearProgress, Stack, Textarea, Typography } from '@mui/joy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckIcon from '@mui/icons-material/Check';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

interface ImportStepProps {
    mode: 'import' | 'unlock';
    onBack: () => void;
    onSubmit: (mnemonic: string) => void;
    isLoading: boolean;
    error: string | null;
}

export const ImportStep: React.FC<ImportStepProps> = ({ mode, onBack, onSubmit, isLoading, error }) => {
    const [input, setInput] = useState('');
    const [showWords, setShowWords] = useState(false);
    const words = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const isValid = words.length === 12;
    const title = mode === 'unlock' ? 'Entrar a mi cuenta' : 'Recuperar mi cuenta';
    const actionLabel = mode === 'unlock' ? 'Desbloquear sesión' : 'Recuperar en este dispositivo';

    return (
        <Stack spacing={2.5}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <IconButton variant="plain" color="neutral" size="sm" onClick={onBack} disabled={isLoading}>
                    <ArrowBackIcon />
                </IconButton>
                <Typography level="title-lg">{title}</Typography>
            </Stack>

            <Box sx={{ p: 2.5, borderRadius: '20px', border: '1px solid', borderColor: 'divider', backgroundColor: 'background.level1' }}>
                <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    Escribe tus 12 palabras en orden. Si son correctas, recuperarás exactamente la misma identidad.
                </Typography>
            </Box>

            <Box sx={{ position: 'relative' }}>
                <Textarea
                    minRows={4}
                    maxRows={6}
                    placeholder="palabra1 palabra2 palabra3 ... palabra12"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onFocus={() => setShowWords(true)}
                    disabled={isLoading}
                    sx={{
                        pr: 5.5,
                        borderRadius: '18px',
                        fontFamily: 'monospace',
                        fontSize: '0.95rem',
                        '& textarea': {
                            filter: showWords ? 'none' : 'blur(6px)',
                            transition: 'filter 0.18s ease'
                        }
                    }}
                />
                <IconButton
                    size="sm"
                    variant="soft"
                    color="neutral"
                    onClick={() => setShowWords((value) => !value)}
                    sx={{ position: 'absolute', top: 10, right: 10, borderRadius: '12px' }}
                >
                    {showWords ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </IconButton>
            </Box>

            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    {words.length} de 12 palabras detectadas
                </Typography>
                {isValid && (
                    <Chip size="sm" color="success" variant="soft" startDecorator={<CheckIcon />} sx={{ borderRadius: '999px' }}>
                        Frase completa
                    </Chip>
                )}
            </Stack>

            {error && <Alert color="danger" variant="soft" sx={{ borderRadius: '16px' }}>{error}</Alert>}

            {isLoading && (
                <Stack spacing={1}>
                    <Typography level="body-xs" sx={{ color: 'text.secondary' }}>Verificando tu identidad…</Typography>
                    <LinearProgress sx={{ borderRadius: '999px' }} />
                </Stack>
            )}

            <Button
                fullWidth
                size="lg"
                startDecorator={<LockOpenIcon />}
                disabled={!isValid || isLoading}
                loading={isLoading}
                onClick={() => onSubmit(input.trim().toLowerCase())}
                sx={{ minHeight: 54, borderRadius: '16px', fontWeight: 700 }}
            >
                {actionLabel}
            </Button>
        </Stack>
    );
};
