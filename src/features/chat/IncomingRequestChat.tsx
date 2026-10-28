import React from 'react';
import { Box, Typography, Button, Alert, Avatar } from '@mui/joy';
import { UserPlus, ShieldCheck, TriangleAlert, Clock, Ban } from 'lucide-react';
import type { UntrustworthyInfo } from '../../types/chat.js';
import { getReputationWarning } from '../../utils/reputationWarning.js';

interface IncomingRequestChatProps {
    contactName?: string;
    avatar?: string;
    receivedAt?: number;
    onAccept: () => void;
    onReject: () => void;
    untrustworthyInfo?: UntrustworthyInfo | null;
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
    const reputationWarning = getReputationWarning(vouchScore);
    const isUntrustworthy = !!untrustworthyInfo || !!reputationWarning;

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
                        <TriangleAlert style={{ fontSize: 16, color: 'var(--joy-palette-warning-main)' }} />
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
                    <Clock style={{ fontSize: 13 }} />
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        Solicitud recibida · {formatTimestamp(receivedAt)}
                    </Typography>
                </Box>
            )}

            {isUntrustworthy ? (
                <Alert
                    variant="soft"
                    color="danger"
                    startDecorator={<TriangleAlert />}
                    sx={{ mb: 4, maxWidth: 450, textAlign: 'left', borderRadius: 'md' }}
                >
                    <Box>
                        <Typography level="title-sm">
                            Reputación muy baja en la red
                        </Typography>
                        <Typography level="body-sm">
                            Este usuario ha sido penalizado por la red por comportamiento malicioso o fallos de integridad.
                            {reputationWarning ? <> {reputationWarning.label}</> : null}{' '}
                            <strong>No se recomienda conectar.</strong>
                        </Typography>
                    </Box>
                </Alert>
            ) : (
                <Alert
                    variant="soft"
                    color="neutral"
                    startDecorator={<UserPlus />}
                    sx={{ mb: 4, maxWidth: 450, textAlign: 'left', borderRadius: 'md' }}
                >
                    <Box>
                        <Typography level="title-sm">
                            Sin avisos de la red
                        </Typography>
                        <Typography level="body-sm">
                            Ninguno de tus contactos ha avalado a este usuario aún. Puede ser normal en usuarios nuevos.
                            Asegúrate de que sea quien dice ser por otro canal.
                        </Typography>
                    </Box>
                </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 2, mt: 0 }}>
                <Button
                    size="lg"
                    variant="outlined"
                    color="neutral"
                    startDecorator={<Ban />}
                    onClick={onReject}
                    sx={{ borderRadius: 'md', fontWeight: 600, px: 3 }}
                >
                    Bloquear
                </Button>
                <Button
                    size="lg"
                    variant="solid"
                    color={isUntrustworthy ? 'warning' : 'primary'}
                    startDecorator={isUntrustworthy ? <TriangleAlert /> : <ShieldCheck />}
                    onClick={onAccept}
                    sx={{ borderRadius: 'md', fontWeight: 600, px: 4 }}
                >
                    {isUntrustworthy ? 'Aceptar con Precaución' : 'Aceptar y Conectar'}
                </Button>
            </Box>
        </Box>
    );
};
