import React, { useState, useEffect } from 'react';
import { Box, Typography, Stack, Button, LinearProgress } from '@mui/joy';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';

export const SectionAlmacenamiento: React.FC = () => {
    const [vaultStats, setVaultStats] = useState<{ count: number; sizeBytes: number } | null>(null);

    useEffect(() => {
        window.upeer?.getVaultStats?.().then(setVaultStats).catch(() => { });
    }, []);

    const fmt = (b: number) => {
        if (b === 0) return '0 B';
        const k = 1024, s = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(b) / Math.log(k));
        return (b / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
    };

    const pct = vaultStats ? Math.min((vaultStats.sizeBytes / (1024 * 1024 * 1024)) * 100, 100) : 0;

    return (
        <Box>
            <Box sx={{ px: 1.5, py: 2 }}>
                <Stack spacing={0.75}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography level="body-md" sx={{ fontWeight: 500 }}>
                            Mensajes guardados para contactos
                        </Typography>
                        <Typography level="body-sm" color="neutral">
                            {vaultStats ? fmt(vaultStats.sizeBytes) : '...'} / 1 GB
                        </Typography>
                    </Box>
                    <LinearProgress
                        determinate
                        value={pct}
                        size="sm"
                        color={pct > 80 ? 'danger' : pct > 60 ? 'warning' : 'primary'}
                    />
                    <Typography level="body-sm" color="neutral">
                        {vaultStats ? `${vaultStats.count} mensajes guardados` : '...'}
                    </Typography>
                </Stack>
            </Box>
            <Box sx={{ px: 1.5, pb: 2 }}>
                <Button
                    size="sm" variant="plain" color="danger" sx={{ px: 0 }}
                    startDecorator={<DeleteForeverIcon sx={{ fontSize: '16px' }} />}
                >
                    Liberar espacio
                </Button>
            </Box>
        </Box>
    );
};
