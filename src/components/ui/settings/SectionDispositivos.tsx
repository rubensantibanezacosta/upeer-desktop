import React from 'react';
import { Box, Typography } from '@mui/joy';
import DevicesIcon from '@mui/icons-material/Devices';
import { DeviceEnrollmentPanel } from './DeviceEnrollmentPanel.js';
import { AuthorizedDeviceList } from './AuthorizedDeviceList.js';
import { DeviceSessionList } from './DeviceSessionList.js';

export const SectionDispositivos: React.FC = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <Box
            sx={{
                px: 2.5,
                py: 2.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'background.surface',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                <DevicesIcon sx={{ fontSize: '15px', opacity: 0.45 }} />
                <Typography level="body-xs" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
                    Dispositivos de la cuenta
                </Typography>
            </Box>
            <Typography level="body-sm" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                Los dispositivos vinculados comparten la misma cuenta, los mismos contactos y las mismas conversaciones.
                Ninguno recibe la frase semilla: cada uno guarda un certificado firmado por la cuenta.
            </Typography>
        </Box>
        <DeviceEnrollmentPanel />
        <AuthorizedDeviceList />
        <DeviceSessionList />
    </Box>
);
