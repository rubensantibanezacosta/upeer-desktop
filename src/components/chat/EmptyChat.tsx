import React from 'react';
import { Box, Typography } from '@mui/joy';
import ShieldIcon from '@mui/icons-material/Shield';

export const EmptyChat: React.FC = () => (
    <Box sx={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        opacity: 0.8,
        textAlign: 'center',
        p: 4
    }}>
        <Box sx={{
            width: 100,
            height: 100,
            backgroundColor: 'background.level1',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 3,
            border: '1px solid',
            borderColor: 'divider'
        }}>
            <ShieldIcon sx={{ fontSize: '48px', color: 'primary.500' }} />
        </Box>
        <Typography level="h4" sx={{ fontWeight: 600, mb: 1 }}>
            Conversación Segura Activada
        </Typography>
        <Typography level="body-md" sx={{ maxWidth: 320, color: 'text.secondary', lineHeight: 1.6 }}>
            Aún no hay mensajes aquí. Envía el primero para comenzar esta conversación cifrada de extremo a extremo.
        </Typography>
    </Box>
);
