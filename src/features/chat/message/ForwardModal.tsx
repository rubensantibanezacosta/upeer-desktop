import React, { useState, useMemo } from 'react';
import {
    Modal, ModalDialog, ModalClose, Typography, Input, Box, Avatar,
    List, ListItem, ListItemButton, ListItemContent, ListItemDecorator,
    Button, Checkbox,
} from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import GroupsIcon from '@mui/icons-material/Groups';
import { getContactCardSummary } from './messageItemSupport.js';

interface ForwardTarget {
    id: string;
    name: string;
    subtitle: string;
    isGroup: boolean;
    avatar?: string;
}

interface ForwardModalProps {
    open: boolean;
    onClose: () => void;
    contacts: { upeerId: string; name: string; avatar?: string; status?: string; lastMessage?: string }[];
    groups: { groupId: string; name: string; avatar?: string; members?: string[]; lastMessage?: string }[];
    onSend: (targets: { id: string; isGroup: boolean }[]) => void;
}

const parseSubtitle = (raw?: string): string => {
    if (!raw) return '';
    const contactCardSummary = getContactCardSummary(raw);
    if (contactCardSummary) return contactCardSummary;
    if (raw.startsWith('{') && raw.endsWith('}')) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed.type === 'file') {
                if (parsed.isVoiceNote) return 'Nota de voz';
                return parsed.fileName ?? 'Archivo';
            }
            if (typeof parsed.text === 'string') return parsed.text;
        } catch { return raw; }
    }
    return raw;
};

export const ForwardModal: React.FC<ForwardModalProps> = ({ open, onClose, contacts, groups, onSend }) => {
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<ForwardTarget[]>([]);

    const targets: ForwardTarget[] = useMemo(() => {
        const connected = contacts
            .filter(c => c.status === 'connected')
            .map(c => ({
                id: c.upeerId,
                name: c.name,
                subtitle: parseSubtitle(c.lastMessage),
                isGroup: false,
                avatar: c.avatar,
            }));
        const grps = groups.map(g => ({
            id: g.groupId,
            name: g.name,
            subtitle: parseSubtitle(g.lastMessage),
            isGroup: true,
            avatar: g.avatar ?? undefined,
        }));
        return [...grps, ...connected];
    }, [contacts, groups]);

    const filtered = useMemo(() => {
        if (!query.trim()) return targets;
        const q = query.toLowerCase();
        return targets.filter(t => t.name.toLowerCase().includes(q));
    }, [targets, query]);

    const handleClose = () => {
        setQuery('');
        setSelected([]);
        onClose();
    };

    const handleSend = () => {
        if (selected.length === 0) return;
        onSend(selected.map(s => ({ id: s.id, isGroup: s.isGroup })));
        handleClose();
    };

    const toggleSelection = (t: ForwardTarget) => {
        setSelected(prev => {
            const index = prev.findIndex(s => s.id === t.id);
            if (index !== -1) {
                return prev.filter((_, i) => i !== index);
            }
            return [...prev, t];
        });
    };

    return (
        <Modal open={open} onClose={handleClose}>
            <ModalDialog
                variant="outlined"
                sx={{
                    width: 460,
                    maxHeight: '80vh',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0,
                    p: 0,
                    overflow: 'hidden',
                }}
            >
                <Box sx={{ px: 2.5, pt: 2, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ModalClose sx={{ position: 'static', ml: 0 }} />
                    <Typography level="title-md" sx={{ fontWeight: 700, flex: 1, textAlign: 'center', pr: 3 }}>
                        Reenviar mensaje a
                    </Typography>
                </Box>

                <Box sx={{ px: 1.5, pb: 1.5 }}>
                    <Input
                        placeholder="Buscar un nombre o número"
                        startDecorator={<SearchIcon sx={{ fontSize: 18 }} />}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        autoFocus
                        size="sm"
                        sx={{ borderRadius: 'md' }}
                    />
                </Box>

                <Typography
                    level="body-xs"
                    sx={{ px: 2.5, pt: 1.5, pb: 0.5, color: 'text.tertiary', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}
                >
                    Chats recientes
                </Typography>

                <List sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', py: 0 }}>
                    {filtered.length === 0 && (
                        <ListItem sx={{ justifyContent: 'center', py: 3 }}>
                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                Sin resultados
                            </Typography>
                        </ListItem>
                    )}
                    {filtered.map(t => {
                        const isSelected = selected.some(s => s.id === t.id);
                        return (
                            <ListItem key={t.id} sx={{ p: 0 }}>
                                <ListItemButton
                                    onClick={() => toggleSelection(t)}
                                    sx={{
                                        height: '72px',
                                        px: 2.5,
                                        borderRadius: 0,
                                        bgcolor: isSelected ? 'primary.softBg' : undefined,
                                        '&:hover': { bgcolor: isSelected ? 'primary.softHoverBg' : undefined },
                                    }}
                                >
                                    <Checkbox
                                        checked={isSelected}
                                        onChange={() => toggleSelection(t)}
                                        onClick={e => e.stopPropagation()}
                                        sx={{ pointerEvents: 'none', mr: 2 }}
                                    />
                                    <ListItemDecorator sx={{ mr: 2 }}>
                                        <Avatar
                                            size="lg"
                                            src={t.avatar}
                                            variant="soft"
                                            color="neutral"
                                            sx={{ borderRadius: 'md' }}
                                        >
                                            {t.isGroup ? <GroupsIcon /> : t.name[0]?.toUpperCase()}
                                        </Avatar>
                                    </ListItemDecorator>
                                    <ListItemContent sx={{ minWidth: 0 }}>
                                        <Typography level="body-md" sx={{ fontWeight: 500 }} noWrap>{t.name}</Typography>
                                        {t.subtitle && (
                                            <Typography level="body-sm" noWrap sx={{ color: 'text.tertiary' }}>
                                                {t.subtitle}
                                            </Typography>
                                        )}
                                    </ListItemContent>
                                </ListItemButton>
                            </ListItem>
                        );
                    })}
                </List>

                {selected.length > 0 && (
                    <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid', borderColor: 'divider' }}>
                        <Typography level="body-sm" sx={{ fontWeight: 600 }}>
                            {selected.length} {selected.length === 1 ? 'seleccionado' : 'seleccionados'}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button variant="plain" color="neutral" size="sm" onClick={handleClose}>
                                Cancelar
                            </Button>
                            <Button size="sm" onClick={handleSend}>
                                Enviar
                            </Button>
                        </Box>
                    </Box>
                )}
            </ModalDialog>
        </Modal>
    );
};
