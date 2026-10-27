import React, { useEffect, useMemo, useState } from 'react';
import {
    Box,
    CircularProgress,
    Divider,
    IconButton,
    Input,
    List,
    ListItem,
    ListItemButton,
    Typography,
} from '@mui/joy';
import { CalendarDays, CheckCheck, MessageSquare, Search, X } from 'lucide-react';
import { useNavigationStore } from '../../store/useNavigationStore.js';
import { summarizeSearchResult, type SearchResultSummary } from './searchResultMeta.js';
import { groupByDay, highlightParts } from './chatSearchResults.js';

interface ChatSearchPanelProps {
    conversationKey: string;
    onClose: () => void;
}

interface SearchResult {
    id: string;
    summary: SearchResultSummary;
    timestamp: number;
    isMine: boolean;
}

const SEARCH_LIMIT = 50;

const panelSx = {
    width: 400,
    minWidth: 320,
    maxWidth: 400,
    flexShrink: 0,
    borderLeft: '1px solid',
    borderColor: 'divider',
    backgroundColor: 'background.surface',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
};

const headerSx = {
    height: '60px',
    px: 2,
    display: 'flex',
    alignItems: 'center',
    gap: 0.75,
    flexShrink: 0,
};

const dayHeaderSx = {
    px: 2,
    py: 1,
    position: 'sticky',
    top: 0,
    zIndex: 1,
    backgroundColor: 'background.surface',
};

export const ChatSearchPanel: React.FC<ChatSearchPanelProps> = ({ conversationKey, onClose }) => {
    const [query, setQuery] = useState('');
    const [rows, setRows] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [dayFilter, setDayFilter] = useState<string | null>(null);
    const [dayMenuOpen, setDayMenuOpen] = useState(false);
    const setPendingScrollMsgId = useNavigationStore((s) => s.setPendingScrollMsgId);

    useEffect(() => {
        const trimmed = query.trim();
        if (!trimmed) {
            setRows([]);
            setSearched(false);
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        const timer = window.setTimeout(() => {
            window.upeer.searchMessages(trimmed, SEARCH_LIMIT, 0)
                .then((results) => {
                    if (cancelled) return;
                    const matching = (results || [])
                        .filter((row) => row.id && row.chatUpeerId === conversationKey && !row.isDeleted)
                        .map((row) => ({
                            id: row.id as string,
                            summary: summarizeSearchResult(row.message || ''),
                            timestamp: Number(row.timestamp),
                            isMine: !!row.isMine,
                        }))
                        .sort((left, right) => right.timestamp - left.timestamp);
                    setRows(matching);
                    setSearched(true);
                })
                .catch((error) => {
                    if (cancelled) return;
                    console.error('Error al buscar mensajes', error);
                    setRows([]);
                    setSearched(true);
                })
                .finally(() => {
                    if (!cancelled) setLoading(false);
                });
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [conversationKey, query]);

    const allGroups = useMemo(() => groupByDay(rows), [rows]);
    const visibleGroups = useMemo(
        () => (dayFilter ? allGroups.filter((group) => group.key === dayFilter) : allGroups),
        [allGroups, dayFilter],
    );
    const visibleCount = visibleGroups.reduce((total, group) => total + group.rows.length, 0);

    useEffect(() => {
        if (dayFilter && !allGroups.some((group) => group.key === dayFilter)) {
            setDayFilter(null);
        }
    }, [allGroups, dayFilter]);

    const openResult = (id: string) => {
        setPendingScrollMsgId(id);
        onClose();
    };

    const hasQuery = query.trim().length > 0;

    return (
        <Box sx={panelSx} role="complementary" aria-label="Buscador de la conversación">
            <Box sx={headerSx}>
                <IconButton aria-label="Cerrar búsqueda" size="sm" variant="plain" color="neutral" onClick={onClose}>
                    <X style={{ fontSize: 20 }} />
                </IconButton>
                <Typography level="title-md" sx={{ fontWeight: 600 }}>Buscar mensajes</Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pb: 1.5, flexShrink: 0 }}>
                <Box sx={{ position: 'relative', display: 'flex' }}>
                    <IconButton
                        aria-label="Filtrar por fecha"
                        size="sm"
                        variant={dayFilter ? 'soft' : 'plain'}
                        color={dayFilter ? 'primary' : 'neutral'}
                        disabled={allGroups.length === 0}
                        onClick={() => setDayMenuOpen((open) => !open)}
                        sx={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }}
                    >
                        <CalendarDays style={{ fontSize: 20 }} />
                    </IconButton>
                    {dayMenuOpen && allGroups.length > 0 && (
                        <>
                            <Box
                                aria-hidden
                                onClick={() => setDayMenuOpen(false)}
                                sx={{ position: 'fixed', inset: 0, zIndex: 19 }}
                            />
                            <List
                                role="menu"
                                aria-label="Fechas con resultados"
                                sx={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    zIndex: 20,
                                    minWidth: 180,
                                    maxHeight: 260,
                                    overflowY: 'auto',
                                    py: 0.5,
                                    borderRadius: 'sm',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    backgroundColor: 'background.surface',
                                    boxShadow: 'md',
                                }}
                            >
                                <ListItem sx={{ p: 0 }}>
                                    <ListItemButton
                                        aria-label="Filtrar por todas las fechas"
                                        selected={dayFilter === null}
                                        onClick={() => { setDayFilter(null); setDayMenuOpen(false); }}
                                        sx={{ borderRadius: 0, px: 1.5, py: 0.75 }}
                                    >
                                        <Typography level="body-sm">Todas las fechas</Typography>
                                    </ListItemButton>
                                </ListItem>
                                {allGroups.map((group) => (
                                    <ListItem key={group.key} sx={{ p: 0 }}>
                                        <ListItemButton
                                            aria-label={`Filtrar por ${group.label}`}
                                            selected={dayFilter === group.key}
                                            onClick={() => { setDayFilter(group.key); setDayMenuOpen(false); }}
                                            sx={{ borderRadius: 0, px: 1.5, py: 0.75 }}
                                        >
                                            <Typography level="body-sm">{group.label}</Typography>
                                        </ListItemButton>
                                    </ListItem>
                                ))}
                            </List>
                        </>
                    )}
                </Box>

                <Input
                    aria-label="Buscar mensajes en esta conversación"
                    size="sm"
                    autoFocus
                    startDecorator={<Search style={{ fontSize: 18 }} />}
                    placeholder="Buscar en la conversación"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    endDecorator={
                        hasQuery ? (
                            <IconButton aria-label="Limpiar búsqueda" size="sm" variant="plain" color="neutral" onClick={() => setQuery('')}>
                                <X style={{ fontSize: 18 }} />
                            </IconButton>
                        ) : null
                    }
                    sx={{ flexGrow: 1, minWidth: 0 }}
                />
            </Box>

            <Divider />

            <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                        <CircularProgress size="sm" />
                    </Box>
                )}

                {!loading && !hasQuery && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, px: 3, py: 6, color: 'text.tertiary' }}>
                        <Search style={{ fontSize: 28 }} />
                        <Typography level="body-sm" textAlign="center">Escribe para buscar en esta conversación</Typography>
                    </Box>
                )}

                {!loading && hasQuery && searched && visibleCount === 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, px: 3, py: 6, color: 'text.tertiary' }}>
                        <MessageSquare style={{ fontSize: 28 }} />
                        <Typography level="body-sm" textAlign="center">No se han encontrado mensajes</Typography>
                    </Box>
                )}

                {!loading && visibleCount > 0 && (
                    <List sx={{ p: 0, '--ListItem-paddingY': '0px', minWidth: 0 }}>
                        {visibleGroups.map((group) => (
                            <React.Fragment key={group.key}>
                                <Box sx={dayHeaderSx}>
                                    <Typography level="body-xs" sx={{ color: 'text.tertiary', fontWeight: 600 }}>
                                        {group.label}
                                    </Typography>
                                </Box>
                                {group.rows.map((row) => (
                                    <ListItem key={row.id} sx={{ p: 0, minWidth: 0 }}>
                                        <ListItemButton
                                            aria-label={`Ir al mensaje: ${row.summary.label}`}
                                            onClick={() => openResult(row.id)}
                                            sx={{
                                                px: 2,
                                                py: 1,
                                                gap: 1,
                                                minWidth: 0,
                                                maxWidth: '100%',
                                                overflow: 'hidden',
                                                borderRadius: 0,
                                                alignItems: 'flex-start',
                                                border: 0,
                                                borderTop: '1px solid',
                                                borderColor: 'divider',
                                            }}
                                        >
                                            {row.isMine
                                                ? <CheckCheck style={{ fontSize: 16, marginTop: 2, color: 'var(--joy-palette-primary-400)', flexShrink: 0 }} />
                                                : <MessageSquare style={{ fontSize: 16, marginTop: 2, color: 'var(--joy-palette-text-tertiary)', flexShrink: 0 }} />}
                                            <Typography
                                                level="body-sm"
                                                sx={{
                                                    flexGrow: 1,
                                                    flexBasis: 0,
                                                    minWidth: 0,
                                                    overflow: 'hidden',
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 3,
                                                    WebkitBoxOrient: 'vertical',
                                                    wordBreak: 'break-word',
                                                }}
                                            >
                                                {highlightParts(row.summary.label, query).map((part, index) => (
                                                    part.match
                                                        ? <Box component="span" key={index} sx={{ color: 'primary.400', fontWeight: 700 }}>{part.text}</Box>
                                                        : <React.Fragment key={index}>{part.text}</React.Fragment>
                                                ))}
                                            </Typography>
                                        </ListItemButton>
                                    </ListItem>
                                ))}
                            </React.Fragment>
                        ))}
                    </List>
                )}
            </Box>

            <Divider />
            <Box sx={{ px: 2, py: 1.25, flexShrink: 0 }}>
                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                    Se buscan los últimos {SEARCH_LIMIT} mensajes de esta conversación.
                </Typography>
            </Box>
        </Box>
    );
};
