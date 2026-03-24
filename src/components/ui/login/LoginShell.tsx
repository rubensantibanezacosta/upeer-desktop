import React from 'react';
import { Box, Chip, Stack, Typography } from '@mui/joy';
import ShieldIcon from '@mui/icons-material/Shield';
import BoltIcon from '@mui/icons-material/Bolt';
import LockIcon from '@mui/icons-material/Lock';
import CloudOffIcon from '@mui/icons-material/CloudOff';

interface LoginShellProps {
    title: string;
    description: string;
    stepLabel: string;
    children: React.ReactNode;
}

const highlights = [
    {
        icon: <BoltIcon sx={{ fontSize: 18 }} />,
        title: 'Directo entre dispositivos',
        description: 'Tus mensajes viajan sin pasar por servidores centrales.'
    },
    {
        icon: <LockIcon sx={{ fontSize: 18 }} />,
        title: 'Acceso por frase secreta',
        description: 'Tus 12 palabras son la llave de tu identidad.'
    },
    {
        icon: <CloudOffIcon sx={{ fontSize: 18 }} />,
        title: 'Sin dependencia de terceros',
        description: 'Tu cuenta y tu historial siguen siendo tuyos.'
    }
];

export const LoginShell: React.FC<LoginShellProps> = ({ title, description, stepLabel, children }) => (
    <Box
        sx={{
            minHeight: '100vh',
            width: '100vw',
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(360px, 520px) minmax(420px, 560px)' },
            background: 'radial-gradient(circle at top left, rgba(59,130,246,0.16), transparent 30%), radial-gradient(circle at bottom right, rgba(168,85,247,0.18), transparent 34%), var(--joy-palette-background-body)',
            overflow: 'hidden'
        }}
    >
        <Box
            sx={{
                display: { xs: 'none', lg: 'flex' },
                flexDirection: 'column',
                justifyContent: 'space-between',
                p: 5,
                borderRight: '1px solid',
                borderColor: 'divider',
                background: 'linear-gradient(180deg, rgba(10,18,34,0.72) 0%, rgba(11,16,32,0.36) 100%)'
            }}
        >
            <Stack spacing={4}>
                <Stack spacing={2.5}>
                    <Box
                        sx={{
                            width: 68,
                            height: 68,
                            borderRadius: '20px',
                            display: 'grid',
                            placeItems: 'center',
                            color: 'primary.300',
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.22), rgba(168,85,247,0.18))',
                            border: '1px solid',
                            borderColor: 'rgba(255,255,255,0.08)'
                        }}
                    >
                        <ShieldIcon sx={{ fontSize: 34 }} />
                    </Box>
                    <Stack spacing={1.5}>
                        <Chip size="sm" variant="soft" color="primary" sx={{ width: 'fit-content', borderRadius: '999px' }}>
                            Identidad soberana
                        </Chip>
                        <Typography level="h1" sx={{ fontSize: 'clamp(2.2rem, 5vw, 3.4rem)', lineHeight: 1.05, letterSpacing: '-0.04em' }}>
                            upeer
                        </Typography>
                        <Typography level="body-lg" sx={{ maxWidth: 420, color: 'text.secondary', lineHeight: 1.65 }}>
                            Mensajería P2P pensada para conversar, moverte entre dispositivos y mantener el control de tu cuenta.
                        </Typography>
                    </Stack>
                </Stack>

                <Stack spacing={1.5}>
                    {highlights.map((item) => (
                        <Box
                            key={item.title}
                            sx={{
                                p: 2,
                                borderRadius: '20px',
                                border: '1px solid',
                                borderColor: 'rgba(255,255,255,0.08)',
                                backgroundColor: 'rgba(255,255,255,0.02)',
                                backdropFilter: 'blur(12px)'
                            }}
                        >
                            <Stack direction="row" spacing={1.5} alignItems="flex-start">
                                <Box sx={{ mt: 0.25, color: 'primary.300' }}>{item.icon}</Box>
                                <Box>
                                    <Typography level="title-sm" sx={{ mb: 0.25 }}>{item.title}</Typography>
                                    <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.55 }}>
                                        {item.description}
                                    </Typography>
                                </Box>
                            </Stack>
                        </Box>
                    ))}
                </Stack>
            </Stack>

            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                Privacidad local · Frase de recuperación · Sin servidores centrales
            </Typography>
        </Box>

        <Box sx={{ display: 'grid', placeItems: 'center', p: { xs: 2, sm: 3, lg: 5 } }}>
            <Box
                sx={{
                    width: '100%',
                    maxWidth: 560,
                    borderRadius: { xs: '24px', sm: '28px' },
                    border: '1px solid',
                    borderColor: 'divider',
                    backgroundColor: 'background.surface',
                    boxShadow: '0 24px 90px rgba(0, 0, 0, 0.22)',
                    p: { xs: 2.5, sm: 4 },
                    backdropFilter: 'blur(24px)'
                }}
            >
                <Stack spacing={3}>
                    <Stack spacing={1.25}>
                        <Chip size="sm" variant="soft" color="primary" sx={{ width: 'fit-content', borderRadius: '999px' }}>
                            {stepLabel}
                        </Chip>
                        <Typography level="h2" sx={{ fontSize: { xs: '1.75rem', sm: '2.25rem' }, lineHeight: 1.08, letterSpacing: '-0.03em' }}>
                            {title}
                        </Typography>
                        <Typography level="body-md" sx={{ color: 'text.secondary', lineHeight: 1.65 }}>
                            {description}
                        </Typography>
                    </Stack>
                    {children}
                </Stack>
            </Box>
        </Box>
    </Box>
);
