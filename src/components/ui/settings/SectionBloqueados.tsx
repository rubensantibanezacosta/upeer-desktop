import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Typography,
    Avatar,
    Button,
    List,
    ListItem,
    CircularProgress,
    Chip,
} from '@mui/joy';
import BlockIcon from '@mui/icons-material/Block';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import PersonOffIcon from '@mui/icons-material/PersonOff';

interface BlockedContact {
    upeerId: string;
    name?: string | null;
    alias?: string | null;
    avatar?: string | null;
    blockedAt?: string | null;
}

export const SectionBloqueados: React.FC = () => {
    const [blocked, setBlocked] = useState<BlockedContact[]>([]);
    const [loading, setLoading] = useState(true);
    const [unblocking, setUnblocking] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        window.upeer.getBlockedContacts().then((list: BlockedContact[]) => {
            setBlocked(list);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const handleUnblock = async (upeerId: string) => {
        setUnblocking(upeerId);
        await window.upeer.unblockContact(upeerId);
        setBlocked(prev => prev.filter(c => c.upeerId !== upeerId));
        setUnblocking(null);
    };

    const formatDate = (iso?: string | null) => {
        if (!iso) return null;
        const d = new Date(iso);
        return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const displayName = (c: BlockedContact) =>
        c.alias || c.name || c.upeerId.slice(0, 12) + '…';

    return (
        <Box sx={{ p: 0 }}>

            {/* Encabezado informativo */}
            <Box sx={{
                px: 3, py: 2.5,
                borderBottom: '1px solid', borderColor: 'divider',
                display: 'flex', alignItems: 'center', gap: 1.5,
            }}>
                <BlockIcon sx={{ color: 'danger.500', fontSize: 20 }} />
                <Box>
                    <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                        Contactos bloqueados
                    </Typography>
                    <Typography level="body-xs" color="neutral">
                        Los usuarios bloqueados no pueden enviarte solicitudes de contacto.
                        Puedes desbloquearlos en cualquier momento.
                    </Typography>
                </Box>
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress size="md" />
                </Box>
            ) : blocked.length === 0 ? (
                <Box sx={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    py: 8, gap: 1.5, color: 'text.tertiary',
                }}>
                    <PersonOffIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                    <Typography level="body-sm" color="neutral">
                        No has bloqueado a ningún usuario
                    </Typography>
                </Box>
            ) : (
                <List sx={{ '--ListItem-paddingY': '0px', p: 0 }}>
                    {blocked.map(c => (
                        <ListItem
                            key={c.upeerId}
                            sx={{
                                px: 3, py: 1.5,
                                borderBottom: '1px solid', borderColor: 'divider',
                                display: 'flex', alignItems: 'center', gap: 2,
                                '&:last-child': { borderBottom: 'none' },
                            }}
                        >
                            {/* Avatar */}
                            <Avatar
                                src={c.avatar || undefined}
                                size="md"
                                sx={{ flexShrink: 0, filter: 'grayscale(60%)' }}
                            >
                                {!c.avatar && displayName(c).charAt(0).toUpperCase()}
                            </Avatar>

                            {/* Info */}
                            <Box sx={{ flexGrow: 1, overflow: 'hidden', minWidth: 0 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography
                                        level="body-md"
                                        sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                    >
                                        {displayName(c)}
                                    </Typography>
                                    <Chip size="sm" color="danger" variant="soft" sx={{ flexShrink: 0 }}>
                                        Bloqueado
                                    </Chip>
                                </Box>
                                <Typography
                                    level="body-xs"
                                    color="neutral"
                                    sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                >
                                    {c.upeerId}
                                </Typography>
                                {c.blockedAt && (
                                    <Typography level="body-xs" color="neutral" sx={{ mt: 0.25 }}>
                                        Bloqueado el {formatDate(c.blockedAt)}
                                    </Typography>
                                )}
                            </Box>

                            {/* Acción */}
                            <Button
                                size="sm"
                                variant="outlined"
                                color="neutral"
                                startDecorator={
                                    unblocking === c.upeerId
                                        ? <CircularProgress size="sm" />
                                        : <LockOpenIcon />
                                }
                                disabled={unblocking === c.upeerId}
                                onClick={() => handleUnblock(c.upeerId)}
                                sx={{ flexShrink: 0 }}
                            >
                                Desbloquear
                            </Button>
                        </ListItem>
                    ))}
                </List>
            )}
        </Box>
    );
};
