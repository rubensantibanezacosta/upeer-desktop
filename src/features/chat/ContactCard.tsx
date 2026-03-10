import React from 'react';
import { Box, Typography, Avatar, Button } from '@mui/joy';
import ShieldIcon from '@mui/icons-material/Shield';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

interface ContactCardProps {
    name: string;
    address: string;
    upeerId: string;
    isMe: boolean;
}

// BUG EB fix: el rango 200::/7 abarca direcciones que comienzan con 200:-3ff:
// (el bit más significativo es 0b00000010 = 2, y el prefijo /7 cubre hasta
// 3ff:...). Usar solo startsWith('200:') descartaba direcciones válidas.
const YGG_PREFIX_RE = /^[23][0-9a-f]{2}:/i;

const normalizeYggdrasilAddress = (addr: string): string => {
    if (!addr) return addr;
    const parts = addr.split(':');
    // Si tiene 7 segmentos y no tiene el prefijo correcto, añadirlo
    if (parts.length === 7 && !YGG_PREFIX_RE.test(addr)) {
        return '200:' + addr;
    }
    return addr;
};

export const ContactCard: React.FC<ContactCardProps> = ({ name, address, upeerId, isMe }) => {
    const normalizedAddress = normalizeYggdrasilAddress(address);
    const fullIdentity = `${upeerId}@${normalizedAddress}`;

    return (
        <Box sx={{ p: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5 }}>
                <Avatar size="lg" sx={{ fontWeight: 700, backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : 'primary.100', color: isMe ? 'white' : 'primary.600' }}>
                    {(name?.[0] ?? '?').toUpperCase()}
                </Avatar>
                <Box>
                    <Typography level="title-md">{name}</Typography>
                    <Typography level="body-xs" sx={{ opacity: 0.7 }}>Contacto compartido</Typography>
                </Box>
            </Box>
            <Box sx={{ backgroundColor: isMe ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)', p: 1.5, borderRadius: 'md', mb: 2 }}>
                <Typography level="body-xs" sx={{ fontWeight: 700, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5, letterSpacing: '0.05em' }}>
                    <ShieldIcon sx={{ fontSize: '13px' }} /> upeer ID
                </Typography>
                <Typography level="body-xs" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', opacity: 0.9 }}>
                    {upeerId}
                </Typography>
            </Box>
            <Button
                size="sm"
                variant="soft"
                fullWidth
                startDecorator={<PersonAddIcon />}
                onClick={() => window.upeer.addContact(fullIdentity, name)}
                sx={{ borderRadius: 'xl', fontWeight: 600 }}
            >
                Guardar Contacto
            </Button>
        </Box>
    );
};
