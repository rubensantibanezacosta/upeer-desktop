import React from 'react';
import { Avatar, Box, Typography } from '@mui/joy';

interface ContactInfoHeroProps {
    avatar?: string;
    contactName: string;
    contactId: string;
    isOnline: boolean;
    status: 'pending' | 'incoming' | 'connected' | 'offline' | 'blocked';
    lastSeenText: string;
    trust?: {
        label: string;
        Icon: React.ElementType;
    } | null;
}

export const ContactInfoHero: React.FC<ContactInfoHeroProps> = ({
    avatar,
    contactName,
    contactId,
    isOnline,
    status,
    lastSeenText,
    trust,
}) => (
    <Box sx={{ pt: 4, pb: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', px: 3, gap: 0.75 }}>
        <Avatar
            src={avatar || undefined}
            variant="soft"
            sx={{ width: 96, height: 96, borderRadius: 'xl', mb: 1, fontSize: '2.5rem' }}
        >
            {(contactName || contactId).charAt(0).toUpperCase()}
        </Avatar>
        <Typography level="h3" sx={{ fontWeight: 700 }}>
            {contactName}
        </Typography>
        <Typography
            level="body-xs"
            color="neutral"
            sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', letterSpacing: '0.02em' }}
        >
            {contactId}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
            {isOnline ? (
                <>
                    <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'success.400', flexShrink: 0 }} />
                    <Typography level="body-xs" sx={{ color: 'success.400' }}>En línea</Typography>
                </>
            ) : status === 'blocked' ? (
                <Typography level="body-xs" sx={{ color: 'danger.400' }}>Bloqueado</Typography>
            ) : status === 'pending' ? (
                <Typography level="body-xs" sx={{ color: 'warning.400' }}>Pendiente</Typography>
            ) : status === 'incoming' ? (
                <Typography level="body-xs" sx={{ color: 'primary.400' }}>Solicitud recibida</Typography>
            ) : lastSeenText ? (
                <Typography level="body-xs" color="neutral">Última vez {lastSeenText}</Typography>
            ) : null}
        </Box>
        {trust && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <trust.Icon sx={{ fontSize: 14, color: 'text.tertiary' }} />
                <Typography level="body-xs" color="neutral">{trust.label}</Typography>
            </Box>
        )}
    </Box>
);
