import React from 'react';
import { Alert, Box, Button, IconButton, Stack, Typography } from '@mui/joy';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DownloadIcon from '@mui/icons-material/Download';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

interface HomeStepProps {
    isLocked: boolean;
    onCreateNew: () => void;
    onImport: () => void;
    onUnlock: () => void;
    onSwitchAccount: () => void;
}

export const HomeStep: React.FC<HomeStepProps> = ({ isLocked, onCreateNew, onImport, onUnlock, onSwitchAccount }) => {
    if (isLocked) {
        return (
            <Stack spacing={2.5}>
                <Alert variant="soft" color="warning" startDecorator={<LockIcon />} sx={{ borderRadius: '18px' }}>
                    Tu cuenta está protegida en este dispositivo. Usa tus 12 palabras para volver a entrar.
                </Alert>
                <Button fullWidth size="lg" startDecorator={<LockOpenIcon />} onClick={onUnlock} sx={{ minHeight: 52, borderRadius: '16px', fontWeight: 700 }}>
                    Entrar a mi cuenta
                </Button>
                <Button fullWidth size="lg" variant="outlined" color="neutral" startDecorator={<AddIcon />} onClick={onSwitchAccount} sx={{ minHeight: 52, borderRadius: '16px', fontWeight: 700 }}>
                    Crear cuenta nueva
                </Button>
                <Button fullWidth size="lg" variant="plain" color="neutral" startDecorator={<DownloadIcon />} onClick={onSwitchAccount} sx={{ minHeight: 48, borderRadius: '16px', fontWeight: 700 }}>
                    Usar otra cuenta existente
                </Button>
            </Stack>
        );
    }

    return (
        <Stack spacing={2.5}>
            <Box
                sx={{
                    p: 2.5,
                    borderRadius: '20px',
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.10), rgba(168,85,247,0.10))',
                    border: '1px solid',
                    borderColor: 'divider'
                }}
            >
                <Typography level="title-md" sx={{ mb: 0.75 }}>Empieza con tu identidad local</Typography>
                <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    Puedes crear una cuenta nueva en este dispositivo o recuperar una existente con tus 12 palabras.
                </Typography>
            </Box>
            <Button fullWidth size="lg" startDecorator={<AddIcon />} onClick={onCreateNew} sx={{ minHeight: 54, borderRadius: '16px', fontWeight: 700 }}>
                Crear cuenta nueva
            </Button>
            <Button fullWidth size="lg" variant="outlined" color="neutral" startDecorator={<DownloadIcon />} onClick={onImport} sx={{ minHeight: 54, borderRadius: '16px', fontWeight: 700 }}>
                Ya tengo una cuenta
            </Button>
        </Stack>
    );
};

interface SwitchAccountWarnStepProps {
    currentId?: string;
    onBack: () => void;
    onContinueCreate: () => void;
    onContinueImport: () => void;
}

export const SwitchAccountWarnStep: React.FC<SwitchAccountWarnStepProps> = ({ currentId, onBack, onContinueCreate, onContinueImport }) => (
    <Stack spacing={2.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
            <IconButton variant="plain" color="neutral" size="sm" onClick={onBack}>
                <ArrowBackIcon />
            </IconButton>
            <Typography level="title-lg">Usar una cuenta diferente</Typography>
        </Stack>

        <Alert variant="soft" color="warning" startDecorator={<WarningAmberIcon />} sx={{ borderRadius: '18px' }}>
            La cuenta {currentId ? `...${currentId.slice(-8)}` : 'actual'} se eliminará de este dispositivo si continúas.
        </Alert>

        <Box sx={{ p: 2.5, borderRadius: '18px', border: '1px solid', borderColor: 'divider', backgroundColor: 'background.level1' }}>
            <Stack spacing={1}>
                <Typography level="title-sm">Qué ocurrirá al cambiar</Typography>
                <Typography level="body-sm" sx={{ color: 'text.secondary' }}>Se cerrará la sesión local actual.</Typography>
                <Typography level="body-sm" sx={{ color: 'text.secondary' }}>Podrás crear una cuenta nueva o recuperar la tuya.</Typography>
                <Typography level="body-sm" sx={{ color: 'text.secondary' }}>La cuenta anterior seguirá recuperable con sus 12 palabras.</Typography>
            </Stack>
        </Box>

        <Stack spacing={1.5}>
            <Button fullWidth size="lg" color="warning" startDecorator={<AddIcon />} onClick={onContinueCreate} sx={{ minHeight: 52, borderRadius: '16px', fontWeight: 700 }}>
                Crear cuenta nueva
            </Button>
            <Button fullWidth size="lg" variant="outlined" color="warning" startDecorator={<DownloadIcon />} onClick={onContinueImport} sx={{ minHeight: 52, borderRadius: '16px', fontWeight: 700 }}>
                Recuperar mi cuenta
            </Button>
            <Button fullWidth size="lg" variant="plain" color="neutral" onClick={onBack} sx={{ minHeight: 48, borderRadius: '16px', fontWeight: 700 }}>
                Cancelar
            </Button>
        </Stack>
    </Stack>
);
