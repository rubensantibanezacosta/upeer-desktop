import React from 'react';
import { Box, Typography } from '@mui/joy';

export const LayoutLoader: React.FC = () => (
    <Box sx={{ height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'background.body' }}>
        <Box sx={{ width: 36, height: 36, border: '3px solid', borderColor: 'primary.500', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />
    </Box>
);

interface DragOverlayProps {
    isDragging: boolean;
}

export const DragOverlay: React.FC<DragOverlayProps> = ({ isDragging }) => {
    if (!isDragging) {
        return null;
    }

    return (
        <Box sx={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            bgcolor: 'rgba(0,0,0,0.4)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', border: '4px dashed', borderColor: 'primary.main', m: 2, borderRadius: 2,
        }}>
            <Typography level="h2" textColor="white">Soltar archivos para enviar</Typography>
        </Box>
    );
};

export const WelcomePlaceholder: React.FC = () => (
    <Box sx={{
        flexGrow: 1,
        width: '100%',
        minWidth: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', position: 'relative', px: 3, textAlign: 'center',
        backgroundColor: 'background.body',
    }}>
        <Box sx={{ opacity: 0.8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Box sx={{
                width: 100, height: 100,
                backgroundColor: 'background.level1',
                borderRadius: 'xl',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                mb: 3, border: '1px solid', borderColor: 'divider',
            }}>
                <Box component="img" src="/logo.svg" sx={{ width: 56, height: 56 }} />
            </Box>
            <Typography level="h4" sx={{ fontWeight: 600, mb: 1 }}>Bienvenido a uPeer</Typography>
            <Typography level="body-md" sx={{ color: 'text.secondary', maxWidth: 320, lineHeight: 1.6 }}>
                Selecciona un contacto para comenzar a chatear. Conectividad sin intermediarios, cifrado de extremo a extremo.
            </Typography>
        </Box>
        <Box sx={{ position: 'absolute', bottom: 32, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography level="body-xs" color="neutral">uPeer - v1.0.0</Typography>
        </Box>
    </Box>
);

export const getEditableMessageText = (rawMessage: string) => {
    if (!rawMessage.startsWith('{') || !rawMessage.endsWith('}')) {
        return rawMessage;
    }

    try {
        const parsed = JSON.parse(rawMessage);
        if (typeof parsed.text === 'string') {
            return parsed.text;
        }
        if (parsed.type === 'file' && typeof parsed.caption === 'string') {
            return parsed.caption;
        }
    } catch {
        return rawMessage;
    }

    return rawMessage;
};