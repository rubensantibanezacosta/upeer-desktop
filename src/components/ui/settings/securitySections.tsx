import React from 'react';
import { Box, Button, Chip, Typography } from '@mui/joy';
import { Shield, KeyRound, TriangleAlert, BadgeCheck } from 'lucide-react';
import { CardGroupLabel, cardBodySx } from './sectionShell.js';

interface SecurityStatusCardProps {
    pinEnabled: boolean;
}

export const SecurityStatusCard: React.FC<SecurityStatusCardProps> = ({ pinEnabled }) => (
    <Box>
        <CardGroupLabel
            icon={<Shield style={{ fontSize: 15 }} />}
            title="Protección de cuenta"
            action={
                <Chip
                    size="sm"
                    color={pinEnabled ? 'success' : 'warning'}
                    variant="soft"
                    startDecorator={pinEnabled ? <BadgeCheck style={{ fontSize: 12 }} /> : <TriangleAlert style={{ fontSize: 12 }} />}
                    sx={{ fontSize: '11px' }}
                >
                    {pinEnabled ? 'Activada' : 'No protegida'}
                </Chip>
            }
        />

        <Box sx={{ ...cardBodySx, pt: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, px: 0.5, py: 0.5 }}>
                {pinEnabled
                    ? <BadgeCheck style={{ fontSize: 18, color: 'var(--joy-palette-success-500)', marginTop: 1, flexShrink: 0 }} />
                    : <TriangleAlert style={{ fontSize: 18, color: 'var(--joy-palette-warning-500)', marginTop: 1, flexShrink: 0 }} />
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
            icon={<KeyRound style={{ fontSize: 15 }} />}
            title="Frase de recuperación"
        />

        <Box
            sx={{
                mb: 3.5,
                px: 0.5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 1.5,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                <TriangleAlert style={{ fontSize: 18, color: 'var(--joy-palette-warning-500)', marginTop: 1, flexShrink: 0 }} />
                <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
                    Estas 12 palabras son la única forma de recuperar tu cuenta si pierdes acceso a este dispositivo. NUNCA las compartas.
                </Typography>
            </Box>
            <Button
                size="sm"
                variant="soft"
                color="warning"
                startDecorator={<KeyRound style={{ fontSize: 16,  }} />}
                onClick={onRevealSeed}
            >
                Revelar mis palabras clave
            </Button>
        </Box>
    </Box>
);

