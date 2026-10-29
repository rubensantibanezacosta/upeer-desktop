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
    const shareActivity = usePrivacyStore((state) => state.shareActivity);
    const presence = visiblePresence(isWithinPresenceWindow(contact.lastActive), contact.lastActive, { shareActivity });

    if (contact.status === 'blocked') {
        return <Typography level="body-xs" color="danger" sx={sx}>Bloqueado</Typography>;
    }
    if (!shareActivity) return null;
    return (
        <Typography level="body-xs" color={presence.isOnline ? 'success' : 'neutral'} sx={sx}>
            {presence.isOnline ? 'En línea' : 'Desconectado'}
        </Typography>
    );
};
