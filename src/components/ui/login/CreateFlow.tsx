import React, { useState } from 'react';
import { Alert, Box, Button, Chip, IconButton, LinearProgress, Stack, Textarea, Typography } from '@mui/joy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { CreateFlowMnemonicPanel } from './CreateFlowMnemonicPanel.js';
import { CreateFlowProfileSetup } from './CreateFlowProfileSetup.js';

interface CreateExplainStepProps {
    onBack: () => void;
    onGenerate: () => void;
    isLoading: boolean;
}

export const CreateExplainStep: React.FC<CreateExplainStepProps> = ({ onBack, onGenerate, isLoading }) => (
    <Stack spacing={2.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton variant="plain" color="neutral" size="sm" onClick={onBack}>
                <ArrowBackIcon />
            </IconButton>
            <Typography level="title-lg">Antes de crear tu cuenta</Typography>
        </Stack>

        <Box sx={{ display: 'grid', gap: 1.5 }}>
            <Box sx={{ p: 2.5, borderRadius: '18px', border: '1px solid', borderColor: 'divider', backgroundColor: 'background.level1' }}>
                <Typography level="title-sm" sx={{ mb: 0.5 }}>No hay servidor que la recupere</Typography>
                <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    Tu identidad se genera localmente y solo depende de tu frase secreta.
                </Typography>
            </Box>
            <Box sx={{ p: 2.5, borderRadius: '18px', border: '1px solid', borderColor: 'divider', backgroundColor: 'background.level1' }}>
                <Typography level="title-sm" sx={{ mb: 0.5 }}>Las 12 palabras son tu llave</Typography>
                <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    Con la misma frase podrás entrar desde cualquier dispositivo y recuperar la misma cuenta.
                </Typography>
            </Box>
            <Alert color="warning" variant="soft" startDecorator={<WarningAmberIcon />} sx={{ borderRadius: '18px' }}>
                Si pierdes estas palabras, nadie podrá devolverte el acceso.
            </Alert>
        </Box>

        <Button fullWidth size="lg" loading={isLoading} onClick={onGenerate} sx={{ minHeight: 54, borderRadius: '16px', fontWeight: 700 }}>
            Generar mis 12 palabras
        </Button>
    </Stack>
);

interface CreateGenerateStepProps {
    mnemonic: string[];
    onBack: () => void;
    onConfirm: () => void;
    onRegenerate: () => void;
}

export const CreateGenerateStep: React.FC<CreateGenerateStepProps> = ({ mnemonic, onBack, onConfirm, onRegenerate }) => {
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(mnemonic.join(' '));
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2200);
    };

    return (
        <Stack spacing={2.5}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <IconButton variant="plain" color="neutral" size="sm" onClick={onBack}>
                    <ArrowBackIcon />
                </IconButton>
                <Typography level="title-lg">Guarda tus palabras</Typography>
            </Stack>

            <Alert color="warning" variant="soft" startDecorator={<WarningAmberIcon />} sx={{ borderRadius: '18px' }}>
                Escríbelas en papel o guárdalas en un lugar privado antes de continuar.
            </Alert>

            <CreateFlowMnemonicPanel mnemonic={mnemonic} revealed={revealed} onReveal={() => setRevealed(true)} />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button
                    fullWidth
                    variant="outlined"
                    color={copied ? 'success' : 'neutral'}
                    startDecorator={copied ? <CheckIcon /> : <ContentCopyIcon />}
                    onClick={handleCopy}
                    disabled={!revealed}
                    sx={{ minHeight: 46, borderRadius: '14px' }}
                >
                    {copied ? 'Copiadas' : 'Copiar palabras'}
                </Button>
                <Button fullWidth variant="outlined" color="neutral" startDecorator={<RefreshIcon />} onClick={onRegenerate} sx={{ minHeight: 46, borderRadius: '14px' }}>
                    Generar otras
                </Button>
            </Stack>

            <Button fullWidth size="lg" disabled={!revealed} onClick={onConfirm} sx={{ minHeight: 54, borderRadius: '16px', fontWeight: 700 }}>
                Ya las guardé
            </Button>
        </Stack>
    );
};

interface CreateConfirmStepProps {
    mnemonic: string[];
    onBack: () => void;
    onConfirmed: (mnemonic: string, alias: string, avatar: string) => void;
    isLoading: boolean;
    error: string | null;
}

export const CreateConfirmStep: React.FC<CreateConfirmStepProps> = ({ mnemonic, onBack, onConfirmed, isLoading, error }) => {
    const [input, setInput] = useState('');
    const [alias, setAlias] = useState('');
    const [avatar, setAvatar] = useState('');
    const words = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const isValid = words.length === 12 && mnemonic.every((word, index) => word === words[index]);

    return (
        <Stack spacing={2.5}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <IconButton variant="plain" color="neutral" size="sm" onClick={onBack} disabled={isLoading}>
                    <ArrowBackIcon />
                </IconButton>
                <Typography level="title-lg">Confirma y personaliza</Typography>
            </Stack>

            <Textarea
                minRows={4}
                placeholder="Escribe aquí tus 12 palabras en orden"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={isLoading}
                sx={{
                    borderRadius: '18px',
                    fontFamily: 'monospace',
                    fontSize: '0.95rem',
                    '--Textarea-focusedHighlight': isValid
                        ? 'var(--joy-palette-success-500)'
                        : words.length === 12
                            ? 'var(--joy-palette-danger-500)'
                            : undefined
                }}
            />

            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    {words.length} de 12 palabras
                </Typography>
                {isValid && <Chip size="sm" color="success" variant="soft" startDecorator={<CheckIcon />} sx={{ borderRadius: '999px' }}>Orden correcto</Chip>}
            </Stack>

            {!isValid && words.length === 12 && <Alert color="danger" variant="soft" sx={{ borderRadius: '16px' }}>Las palabras no coinciden o no están en el mismo orden.</Alert>}
            {error && <Alert color="danger" variant="soft" sx={{ borderRadius: '16px' }}>{error}</Alert>}

            {isLoading && (
                <Stack spacing={1}>
                    <Typography level="body-xs" sx={{ color: 'text.secondary' }}>Configurando tu cuenta…</Typography>
                    <LinearProgress sx={{ borderRadius: '999px' }} />
                </Stack>
            )}

            <CreateFlowProfileSetup alias={alias} avatar={avatar} isLoading={isLoading} onAliasChange={setAlias} onAvatarChange={setAvatar} />

            <Button
                fullWidth
                size="lg"
                disabled={!isValid || isLoading}
                loading={isLoading}
                onClick={() => onConfirmed(mnemonic.join(' '), alias.trim(), avatar)}
                sx={{ minHeight: 54, borderRadius: '16px', fontWeight: 700 }}
            >
                Crear mi cuenta
            </Button>
        </Stack>
    );
};
