import React from 'react';
import { Box, Typography, Avatar, Button } from '@mui/joy';
import ShieldIcon from '@mui/icons-material/Shield';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

interface ContactCardProps {
    name: string;
    address: string;
    upeerId: string;
    isMe: boolean;
    avatar?: string;
}

const YGG_PREFIX_RE = /^[23][0-9a-f]{2}:/i;

const normalizeYggdrasilAddress = (addr: string): string => {
    if (!addr) return addr;
    const parts = addr.split(':');
    if (parts.length === 7 && !YGG_PREFIX_RE.test(addr)) {
        return '200:' + addr;
    }
    return addr;
};

export const ContactCard: React.FC<ContactCardProps> = ({ name, address, upeerId, isMe, avatar }) => {
    const normalizedAddress = normalizeYggdrasilAddress(address);
    const fullIdentity = `${upeerId}@${normalizedAddress}`;

    return (
        <Box sx={{ p: 1.25, borderRadius: 'md', bgcolor: isMe ? 'rgba(255,255,255,0.08)' : 'background.level1' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.25 }}>
                <Avatar size="lg" src={avatar} sx={{ fontWeight: 700, backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : 'primary.100', color: isMe ? 'white' : 'primary.600', borderRadius: 'md' }}>
                    {(name?.[0] ?? '?').toUpperCase()}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                    <Typography level="title-sm" noWrap>{name}</Typography>
                    <Typography level="body-xs" sx={{ opacity: 0.7 }} noWrap>Tarjeta de contacto</Typography>
                </Box>
            </Box>
            <Box sx={{ backgroundColor: isMe ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)', p: 1.25, borderRadius: 'md', mb: 1.25 }}>
                <Typography level="body-xs" sx={{ fontWeight: 700, mb: 0.35, display: 'flex', alignItems: 'center', gap: 0.5, letterSpacing: '0.05em' }}>
                    <ShieldIcon sx={{ fontSize: '13px' }} /> UPEER ID
                </Typography>
                <Typography level="body-xs" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', opacity: 0.9, mb: 1 }}>
                    {upeerId}
                </Typography>
                <Typography level="body-xs" sx={{ fontWeight: 700, mb: 0.35, letterSpacing: '0.05em' }}>
                    DIRECCIÓN
                </Typography>
                <Typography level="body-xs" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', opacity: 0.75 }}>
                    {normalizedAddress}
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
                Guardar contacto
            </Button>
        </Box>
    );
};
