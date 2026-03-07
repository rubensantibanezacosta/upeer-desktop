import React from 'react';
import { Box, Typography, Button, Alert } from '@mui/joy';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ShieldIcon from '@mui/icons-material/Shield';
import WarningIcon from '@mui/icons-material/Warning';

interface IncomingRequestChatProps {
    contactName?: string;
    onAccept: () => void;
    untrustworthyInfo?: any;
}

export const IncomingRequestChat: React.FC<IncomingRequestChatProps> = ({
    contactName,
    onAccept,
    untrustworthyInfo
}) => {
    const isUntrustworthy = !!untrustworthyInfo;

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: '100%',
            boxSizing: 'border-box',
            backgroundColor: 'background.surface',
            textAlign: 'center',
            p: 3
        }}>
            <Box sx={{
                width: 120, height: 120,
                backgroundColor: isUntrustworthy ? 'warning.softBg' : 'background.level1',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
                border: isUntrustworthy ? '1px solid' : 'none',
                borderColor: 'warning.outlinedBorder'
            }}>
                {isUntrustworthy ? (
                    <WarningIcon sx={{ fontSize: '64px', color: 'warning.main' }} />
                ) : (
                    <PersonAddIcon sx={{ fontSize: '64px', color: 'primary.main' }} />
                )}
            </Box>

            <Typography level="h3" sx={{ fontWeight: 600, mb: 1 }}>
                {isUntrustworthy ? 'Solicitud de Contacto' : 'Solicitud de Conexión'}
            </Typography>

            <Typography level="body-md" sx={{ maxWidth: 400, color: 'text.secondary', mb: 4 }}>
                <strong>{contactName || 'Un usuario desconocido'}</strong> quiere establecer una conexión segura contigo.
                Al aceptar, establecerás una conexión cifrada de extremo a extremo.
            </Typography>

            {isUntrustworthy && (
                <Alert
                    variant="soft"
                    color="warning"
                    startDecorator={<WarningIcon />}
                    sx={{ mb: 4, maxWidth: 450, textAlign: 'left', borderRadius: 'md' }}
                >
                    <Box>
                        <Typography level="title-sm">
                            Reputación Baja Detectada
                        </Typography>
                        <Typography level="body-sm">
                            Este usuario es nuevo en la red o tiene un comportamiento sospechoso. Procede con precaución y asegúrate de conocer su identidad.
                        </Typography>
                    </Box>
                </Alert>
            )}

            <Button
                size="lg"
                variant="solid"
                color={isUntrustworthy ? "warning" : "primary"}
                startDecorator={isUntrustworthy ? <WarningIcon /> : <ShieldIcon />}
                onClick={onAccept}
                sx={{
                    borderRadius: 'md',
                    fontWeight: 600,
                    px: 4,
                }}
            >
                {isUntrustworthy ? 'Aceptar con Precaución' : 'Aceptar y Conectar'}
            </Button>
        </Box>
    );
};
