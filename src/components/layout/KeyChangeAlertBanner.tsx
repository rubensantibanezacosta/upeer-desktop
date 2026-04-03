import React from 'react';
import { Alert, Box, Button, Typography } from '@mui/joy';
import WarningIcon from '@mui/icons-material/Warning';

import type { KeyChangeAlert } from '../../types/chat.js';

interface KeyChangeAlertBannerProps {
    alert: KeyChangeAlert;
    onDismiss: () => void;
}

export const KeyChangeAlertBanner: React.FC<KeyChangeAlertBannerProps> = ({ alert, onDismiss }) => (
    <Box sx={{ px: 2, pt: 2, backgroundColor: 'background.body' }}>
        <Alert
            color="warning"
            variant="soft"
            startDecorator={<WarningIcon />}
            endDecorator={(
                <Button size="sm" variant="plain" color="warning" onClick={onDismiss}>
                    Entendido
                </Button>
            )}
            sx={{ alignItems: 'flex-start', borderRadius: 'md' }}
        >
            <Box>
                <Typography level="title-sm">Cambio de clave detectado</Typography>
                <Typography level="body-sm" sx={{ mt: 0.5 }}>
                    La identidad de {alert.alias || alert.upeerId} presentó una clave distinta. Verifica la huella antes de seguir compartiendo información sensible.
                </Typography>
                <Typography level="body-xs" sx={{ mt: 1.25, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    Huella anterior: {alert.oldFingerprint}
                </Typography>
                <Typography level="body-xs" sx={{ mt: 0.5, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    Huella nueva: {alert.newFingerprint}
                </Typography>
            </Box>
        </Alert>
    </Box>
);