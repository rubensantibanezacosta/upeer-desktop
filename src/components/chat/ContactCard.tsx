import React from 'react';
import { Box, Typography, Avatar, Button } from '@mui/joy';
import ShieldIcon from '@mui/icons-material/Shield';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

interface ContactCardProps {
    name: string;
    address: string;
    revelnestId: string;
    isMe: boolean;
}

const normalizeYggdrasilAddress = (addr: string): string => {
    if (!addr) return addr;
    const parts = addr.split(':');
    // Si tiene 7 segmentos y no empieza con 200:, añadir prefijo
    if (parts.length === 7 && !addr.startsWith('200:')) {
        return '200:' + addr;
    }
    // Si ya tiene prefijo 200: y 8 segmentos, usar tal cual
    // Si tiene otro formato, devolver como está (la validación fallará después)
    return addr;
};

export const ContactCard: React.FC<ContactCardProps> = ({ name, address, revelnestId, isMe }) => {
    const normalizedAddress = normalizeYggdrasilAddress(address);
    const fullIdentity = `${revelnestId}@${normalizedAddress}`;
    
    return (
        <Box sx={{ p: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
                <Avatar size="lg" sx={{ fontWeight: 700, backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : 'primary.100', color: isMe ? 'white' : 'primary.600' }}>
                    {name[0].toUpperCase()}
                </Avatar>
                <Box>
                    <Typography level="title-md">{name}</Typography>
                    <Typography level="body-xs" sx={{ opacity: 0.7 }}>Contacto compartido</Typography>
                </Box>
            </Box>
            <Box sx={{ backgroundColor: isMe ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)', p: 1.5, borderRadius: 'md', mb: 2 }}>
                <Typography level="body-xs" sx={{ fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, letterSpacing: '0.05em' }}>
                    <ShieldIcon sx={{ fontSize: '13px' }} /> REVELNEST ID
                </Typography>
                <Typography level="body-xs" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', opacity: 0.9 }}>
                    {revelnestId}
                </Typography>
            </Box>
            <Button
                size="sm"
                variant="soft"
                fullWidth
                startDecorator={<PersonAddIcon />}
                onClick={() => window.revelnest.addContact(fullIdentity, name)}
                sx={{ borderRadius: 'xl', fontWeight: 600 }}
            >
                Guardar Contacto
            </Button>
        </Box>
    );
};
