import React from 'react';
import { Alert, Box, Button, Chip, Typography } from '@mui/joy';
import ShieldIcon from '@mui/icons-material/Shield';
import KeyIcon from '@mui/icons-material/Key';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import WarningIcon from '@mui/icons-material/Warning';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

interface SecurityStatusCardProps {
    pinEnabled: boolean;
}

export const SecurityStatusCard: React.FC<SecurityStatusCardProps> = ({ pinEnabled }) => (
    <Box
        sx={{
            px: 2.5,
            py: 2.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.surface',
        }}
    >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <ShieldIcon sx={{ fontSize: '15px', opacity: 0.45 }} />
                <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
                    Protección de cuenta
                </Typography>
            </Box>
            <Chip
                size="sm"
                color={pinEnabled ? 'success' : 'warning'}
                variant="soft"
                startDecorator={pinEnabled ? <VerifiedUserIcon sx={{ fontSize: '12px' }} /> : <WarningIcon sx={{ fontSize: '12px' }} />}
                sx={{ fontSize: '11px' }}
            >
                {pinEnabled ? 'Activada' : 'No protegida'}
            </Chip>
        </Box>

        <Alert
            color={pinEnabled ? 'primary' : 'warning'}
            variant="soft"
            size="sm"
            startDecorator={pinEnabled ? <ShieldIcon sx={{ fontSize: '18px' }} /> : <WarningIcon sx={{ fontSize: '18px' }} />}
            sx={{ borderRadius: 'md', mb: 1.5 }}
        >
            <Typography level="body-sm">
                {pinEnabled
                    ? 'Tu aplicación está protegida con PIN local.'
                    : 'Activa el PIN para evitar que otros accedan a tus mensajes en este equipo.'}
            </Typography>
        </Alert>
    </Box>
);

interface RecoverySectionProps {
    onRevealSeed: () => void;
}

export const RecoverySection: React.FC<RecoverySectionProps> = ({ onRevealSeed }) => (
    <Box sx={{ px: 2.5, py: 3, backgroundColor: 'background.surface' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
            <KeyIcon sx={{ fontSize: '15px', opacity: 0.45 }} />
            <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
                Recuperación de cuenta
            </Typography>
        </Box>

        <Box
            sx={{
                p: 2,
                borderRadius: 'lg',
                border: '1px solid',
                borderColor: 'warning.outlinedBorder',
                backgroundColor: 'warning.softBg',
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
            }}
        >
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                <WarningIcon sx={{ fontSize: '18px', color: 'warning.main', mt: 0.2, flexShrink: 0 }} />
                <Box>
                    <Typography level="body-md" sx={{ fontWeight: 600, color: 'warning.600' }}>
                        Frase de recuperación
                    </Typography>
                    <Typography level="body-sm" sx={{ color: 'warning.500', mt: 0.5, lineHeight: 1.5 }}>
                        Estas 12 palabras son la única forma de recuperar tu cuenta si pierdes acceso a este dispositivo. NUNCA las compartas.
                    </Typography>
                </Box>
            </Box>
            <Button
                size="sm"
                variant="solid"
                color="warning"
                startDecorator={<KeyIcon sx={{ fontSize: '16px' }} />}
                onClick={onRevealSeed}
                sx={{ alignSelf: 'flex-start', mt: 1, px: 2 }}
            >
                Revelar mis palabras clave
            </Button>
        </Box>
    </Box>
);

interface DangerZoneSectionProps {
    onDeleteClick: () => void;
}

export const DangerZoneSection: React.FC<DangerZoneSectionProps> = ({ onDeleteClick }) => (
    <Box sx={{ px: 2.5, py: 3, backgroundColor: 'background.surface', borderTop: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
            <DeleteForeverIcon sx={{ fontSize: '15px', color: 'danger.500' }} />
            <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'danger.500' }}>
                Zona de peligro
            </Typography>
        </Box>
        <Typography level="body-sm" color="neutral" sx={{ mb: 2, lineHeight: 1.5 }}>
            Elimina todos tus mensajes, contactos e identidad de este equipo de forma permanente.
        </Typography>
        <Button
            size="sm"
            color="danger"
            variant="soft"
            startDecorator={<DeleteForeverIcon sx={{ fontSize: '16px' }} />}
            sx={{ fontWeight: 600 }}
            onClick={onDeleteClick}
        >
            Eliminar cuenta y datos locales
        </Button>
    </Box>
);
