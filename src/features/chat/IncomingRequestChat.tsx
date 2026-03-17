import React from 'react';
import { Box, Typography, Button, Alert, Avatar } from '@mui/joy';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ShieldIcon from '@mui/icons-material/Shield';
import WarningIcon from '@mui/icons-material/Warning';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CloseIcon from '@mui/icons-material/Close';
import BlockIcon from '@mui/icons-material/Block';

interface IncomingRequestChatProps {
    contactName?: string;
    avatar?: string;
    receivedAt?: number;
    onAccept: () => void;
    onReject: () => void;
    untrustworthyInfo?: any;
    /** Score G-Set CRDT (0-100, neutral=50). undefined si no hay datos aún. */
    vouchScore?: number;
}

export const IncomingRequestChat: React.FC<IncomingRequestChatProps> = ({
    contactName,
    avatar,
    receivedAt,
    onAccept,
    onReject,
    untrustworthyInfo,
    vouchScore,
}) => {
    // vouchScore: 0-100, neutral=50. undefined = sin datos (usuario nuevo).
    const hasVouchData = vouchScore !== undefined;
    const isUntrustworthy = !!untrustworthyInfo || (hasVouchData && vouchScore < 40);
    const isTrusted = hasVouchData && vouchScore >= 65;
    const isNew = !hasVouchData || vouchScore === 50;

    const formatTimestamp = (ts?: number) => {
        if (!ts) return null;
        const date = new Date(ts);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (isToday) return `Hoy a las ${time}`;
        return date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) + ` a las ${time}`;
    };

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
            <Box sx={{ position: 'relative', mb: 3 }}>
                <Avatar
                    src={avatar || undefined}
                    sx={{
                        borderRadius: 'lg',
                        fontSize: '3rem',
                        backgroundColor: isUntrustworthy ? 'warning.softBg' : 'background.level1',
                        border: '2px solid',
                        borderColor: isUntrustworthy ? 'warning.outlinedBorder' : 'divider',
                    }}
                >
                    {contactName ? contactName[0].toUpperCase() : '?'}
                </Avatar>
                {isUntrustworthy && (
                    <Box sx={{
                        position: 'absolute', bottom: 4, right: 4,
                        width: 28, height: 28, borderRadius: 'sm',
                        backgroundColor: 'warning.softBg',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '2px solid', borderColor: 'background.surface'
                    }}>
                        <WarningIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                    </Box>
                )}
            </Box>

            <Typography level="h3" sx={{ fontWeight: 600, mb: 1 }}>
                {isUntrustworthy ? 'Solicitud de Contacto' : 'Solicitud de Conexión'}
            </Typography>

            <Typography level="body-md" sx={{ maxWidth: 400, color: 'text.secondary', mb: receivedAt ? 1 : 4 }}>
                <strong>{contactName || 'Un usuario desconocido'}</strong> quiere establecer una conexión segura contigo.
                Al aceptar, establecerás una conexión cifrada de extremo a extremo.
            </Typography>

            {receivedAt && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 4, color: 'text.tertiary' }}>
                    <AccessTimeIcon sx={{ fontSize: 13 }} />
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        Solicitud recibida · {formatTimestamp(receivedAt)}
                    </Typography>
                </Box>
            )}

            {isUntrustworthy ? (
                <Alert
                    variant="soft"
                    color="danger"
                    startDecorator={<WarningIcon />}
                    sx={{ mb: 4, maxWidth: 450, textAlign: 'left', borderRadius: 'md' }}
                >
                    <Box>
                        <Typography level="title-sm">
                            ¡Peligro! Reputación Negativa
                        </Typography>
                        <Typography level="body-sm">
                            Este usuario ha sido penalizado por la red por comportamiento malicioso o fallos de integridad.
                            {hasVouchData && <> Puntuación de la red: <strong>{vouchScore}/100</strong>.</>}{' '}
                            <strong>No se recomienda conectar.</strong>
                        </Typography>
                    </Box>
                </Alert>
            ) : isTrusted ? (
                <Alert
                    variant="soft"
                    color="success"
                    startDecorator={<ShieldIcon />}
                    sx={{ mb: 4, maxWidth: 450, textAlign: 'left', borderRadius: 'md' }}
                >
                    <Box>
                        <Typography level="title-sm">
                            Identidad Conocida por la Red
                        </Typography>
                        <Typography level="body-sm">
                            Este usuario tiene un historial positivo avalado por tus contactos directos.
                            Puntuación de confianza: <strong>{vouchScore}/100</strong>.
                        </Typography>
                    </Box>
                </Alert>
            ) : isNew ? (
                <Alert
                    variant="soft"
                    color="neutral"
                    startDecorator={<PersonAddIcon />}
                    sx={{ mb: 4, maxWidth: 450, textAlign: 'left', borderRadius: 'md' }}
                >
                    <Box>
                        <Typography level="title-sm">
                            Usuario Nuevo o Sin Historial
                        </Typography>
                        <Typography level="body-sm">
                            Ninguno de tus contactos ha avalado a este usuario aún. Puede ser normal para usuarios nuevos.
                            Asegúrate de que sea quien dice ser por otro canal.
                        </Typography>
                    </Box>
                </Alert>
            ) : null}

            <Box sx={{ display: 'flex', gap: 2, mt: 0 }}>
                <Button
                    size="lg"
                    variant="outlined"
                    color="neutral"
                    startDecorator={<BlockIcon />}
                    onClick={onReject}
                    sx={{ borderRadius: 'md', fontWeight: 600, px: 3 }}
                >
                    Bloquear
                </Button>
                <Button
                    size="lg"
                    variant="solid"
                    color={isUntrustworthy ? 'warning' : 'primary'}
                    startDecorator={isUntrustworthy ? <WarningIcon /> : <ShieldIcon />}
                    onClick={onAccept}
                    sx={{ borderRadius: 'md', fontWeight: 600, px: 4 }}
                >
                    {isUntrustworthy ? 'Aceptar con Precaución' : 'Aceptar y Conectar'}
                </Button>
            </Box>
        </Box>
    );
};
