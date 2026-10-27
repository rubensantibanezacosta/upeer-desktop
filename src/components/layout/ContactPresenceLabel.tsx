import React from 'react';
import { Typography } from '@mui/joy';
import { usePrivacyStore } from '../../store/usePrivacyStore.js';
import { isWithinPresenceWindow, visiblePresence } from '../../utils/presenceVisibility.js';
import type { Contact } from '../../types/chat.js';

interface ContactPresenceLabelProps {
    contact: Contact;
    sx?: Record<string, unknown>;
}

export const ContactPresenceLabel: React.FC<ContactPresenceLabelProps> = ({ contact, sx }) => {
    const onlineStatusPref = usePrivacyStore((state) => state.onlineStatus);
    const lastSeenPref = usePrivacyStore((state) => state.lastSeen);
    const presence = visiblePresence(isWithinPresenceWindow(contact.lastActive), contact.lastActive, {
        onlineStatus: onlineStatusPref,
        lastSeen: lastSeenPref,
    });

    if (contact.status === 'blocked') {
        return <Typography level="body-xs" color="danger" sx={sx}>Bloqueado</Typography>;
    }
    if (!onlineStatusPref) return null;
    return (
        <Typography level="body-xs" color={presence.isOnline ? 'success' : 'neutral'} sx={sx}>
            {presence.isOnline ? 'En línea' : 'Desconectado'}
        </Typography>
    );
};
