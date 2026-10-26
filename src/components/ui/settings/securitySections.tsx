import React from 'react';
import { Box, Button, Chip, Typography } from '@mui/joy';
import ShieldIcon from '@mui/icons-material/Shield';
import KeyIcon from '@mui/icons-material/Key';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import WarningIcon from '@mui/icons-material/Warning';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import { CardGroupLabel, cardBodySx } from './sectionShell.js';

interface SecurityStatusCardProps {
    pinEnabled: boolean;
}

export const SecurityStatusCard: React.FC<SecurityStatusCardProps> = ({ pinEnabled }) => (
    <Box>
        <CardGroupLabel
            icon={<ShieldIcon sx={{ fontSize: '15px' }} />}
            title="Protección de cuenta"
            action={
                <Chip
                    size="sm"
                    color={pinEnabled ? 'success' : 'warning'}
                    variant="soft"
                    startDecorator={pinEnabled ? <VerifiedUserIcon sx={{ fontSize: '12px' }} /> : <WarningIcon sx={{ fontSize: '12px' }} />}
                    sx={{ fontSize: '11px' }}
                >
                    {pinEnabled ? 'Activada' : 'No protegida'}
                </Chip>
            }
        />

        <Box sx={{ ...cardBodySx, pt: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, px: 0.5, py: 0.5 }}>
                {pinEnabled
                    ? <VerifiedUserIcon sx={{ fontSize: '18px', color: 'success.500', mt: '1px', flexShrink: 0 }} />
                    : <WarningIcon sx={{ fontSize: '18px', color: 'warning.500', mt: '1px', flexShrink: 0 }} />
                }
                <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                    {pinEnabled
                        ? 'Tu aplicación está protegida con PIN local.'
                        : 'Activa el PIN para evitar que otros accedan a tus mensajes en este equipo.'}
                </Typography>
            </Box>
        </Box>
    </Box>
);

interface RecoverySectionProps {
    onRevealSeed: () => void;
}

export const RecoverySection: React.FC<RecoverySectionProps> = ({ onRevealSeed }) => (
    <Box>
        <CardGroupLabel
            icon={<KeyIcon sx={{ fontSize: '15px' }} />}
            title="Frase de recuperación"
        />

        <Box
            sx={{
                mb: 1,
                px: 0.5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 1.5,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                <WarningIcon sx={{ fontSize: '18px', color: 'warning.500', mt: '1px', flexShrink: 0 }} />
                <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
                    Estas 12 palabras son la única forma de recuperar tu cuenta si pierdes acceso a este dispositivo. NUNCA las compartas.
                </Typography>
            </Box>
            <Button
                size="sm"
                variant="soft"
                color="warning"
                startDecorator={<KeyIcon sx={{ fontSize: '16px' }} />}
                onClick={onRevealSeed}
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
    <Box sx={{ backgroundColor: 'danger.softBg', borderRadius: '12px', my: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 1.75 }}>
            <DeleteForeverIcon sx={{ fontSize: '15px', color: 'danger.300' }} />
            <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'danger.300' }}>
                Zona de peligro
            </Typography>
        </Box>
        <Box sx={{ px: 2, py: 1.25 }}>
            <Typography level="body-sm" sx={{ color: 'text.secondary', mb: 1.75, lineHeight: 1.5 }}>
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
    </Box>
);
