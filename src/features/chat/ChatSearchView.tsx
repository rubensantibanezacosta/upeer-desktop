import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { ArrowLeft, CalendarDays, CheckCheck, ChevronLeft, ChevronRight, MessageSquare, Search, X } from 'lucide-react';
import { useNavigationStore } from '../../store/useNavigationStore.js';
import { summarizeSearchResult, type SearchResultSummary } from './searchResultMeta.js';
import { groupByDay, highlightParts } from './chatSearchResults.js';
import { buildMonthGrid, cursorOf, dayKeyOfDate, monthLabel, shiftMonth, timestampOfDayKey, WEEKDAY_LABELS, type MonthCursor } from './searchDatePicker.js';

interface ChatSearchViewProps {
    conversationKey: string;
    onBack: () => void;
}

interface SearchHit {
    id: string;
    summary: SearchResultSummary;
    timestamp: number;
    isMine: boolean;
}

const PAGE_SIZE = 40;
const LOAD_AHEAD_PX = 160;

const calendarCellSx = {
    width: 30,
    height: 30,
    minWidth: 30,
    borderRadius: '50%',
    fontSize: '12px',
    fontWeight: 500,
};

export const ChatSearchView: React.FC<ChatSearchViewProps> = ({ conversationKey, onBack }) => {
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<SearchHit[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [dayFilter, setDayFilter] = useState<string | null>(null);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [cursor, setCursor] = useState<MonthCursor>(() => cursorOf(Date.now()));
    const loadingRef = useRef(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const setPendingScrollMsgId = useNavigationStore((s) => s.setPendingScrollMsgId);

    const trimmed = query.trim();
    const dayTimestamp = dayFilter ? timestampOfDayKey(dayFilter) : null;
    const range = useMemo(() => {
        if (dayTimestamp === null || !Number.isFinite(dayTimestamp)) return undefined;
        const start = new Date(dayTimestamp);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return { from: start.getTime(), to: end.getTime() };
    }, [dayTimestamp]);

    useEffect(() => {
        setHits([]);
        setHasMore(false);
        setSearched(false);
        setLoading(false);
        loadingRef.current = false;
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        if (!trimmed) return;

        let cancelled = false;
        loadingRef.current = true;
        setLoading(true);
        const timer = window.setTimeout(() => {
            window.upeer.searchChatMessages(conversationKey, trimmed, PAGE_SIZE, 0, range)
                .then((rows) => {
                    if (cancelled) return;
                    const mapped = (rows || []).map((row) => ({
                        id: row.id as string,
                        summary: summarizeSearchResult(row.message || ''),
                        timestamp: Number(row.timestamp),
                        isMine: !!row.isMine,
                    }));
                    setHits(mapped);
                    setHasMore((rows || []).length === PAGE_SIZE);
                    setSearched(true);
                })
                .catch((error) => {
                    if (cancelled) return;
                    console.error('Error al buscar mensajes del chat', error);
                    setHits([]);
                    setSearched(true);
                })
                .finally(() => {
                    if (cancelled) return;
                    loadingRef.current = false;
                    setLoading(false);
                });
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [conversationKey, trimmed, range]);

    const loadMore = () => {
        if (!trimmed || loadingRef.current || !hasMore) return;
        loadingRef.current = true;
        setLoading(true);
        window.upeer.searchChatMessages(conversationKey, trimmed, PAGE_SIZE, hits.length, range)
            .then((rows) => {
                const mapped = (rows || []).map((row) => ({
                    id: row.id as string,
                    summary: summarizeSearchResult(row.message || ''),
                    timestamp: Number(row.timestamp),
                    isMine: !!row.isMine,
                }));
                setHits((current) => {
                    const seen = new Set(current.map((hit) => hit.id));
                    return [...current, ...mapped.filter((hit) => !seen.has(hit.id))];
                });
                setHasMore((rows || []).length === PAGE_SIZE);
            })
            .catch((error) => {
                console.error('Error al paginar mensajes del chat', error);
                setHasMore(false);
            })
            .finally(() => {
                loadingRef.current = false;
                setLoading(false);
            });
    };

    const handleScroll = () => {
        const node = scrollRef.current;
        if (!node) return;
        if (node.scrollHeight - node.scrollTop - node.clientHeight <= LOAD_AHEAD_PX) {
            loadMore();
        }
    };

    const daysWithHits = useMemo(() => new Set(hits.map((hit) => dayKeyOfDate(new Date(hit.timestamp)))), [hits]);
    const groups = useMemo(() => groupByDay(hits), [hits]);
    const selectedDayLabel = useMemo(() => {
        if (!dayTimestamp) return null;
        return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(dayTimestamp));
    }, [dayTimestamp]);

    const openResult = (id: string) => {
        setPendingScrollMsgId(id);
        onBack();
    };

    const selectDay = (dayKey: string) => {
        setDayFilter(dayKey);
        setCalendarOpen(false);
    };

    const cells = buildMonthGrid(cursor);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'background.surface', minWidth: 0 }}>
            <Box sx={{ height: '60px', px: 2, display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                <IconButton aria-label="Volver desde la búsqueda" size="sm" variant="plain" color="neutral" onClick={onBack}>
                    <ArrowLeft style={{ fontSize: 20 }} />
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
                        onClick={() => { setCalendarOpen((open) => !open); setCursor(cursorOf(dayTimestamp ?? Date.now())); }}
                        sx={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }}
                    >
                        <CalendarDays style={{ fontSize: 20 }} />
                    </IconButton>
                    {calendarOpen && (
                        <>
                            <Box aria-hidden onClick={() => setCalendarOpen(false)} sx={{ position: 'fixed', inset: 0, zIndex: 19 }} />
                            <Box
                                aria-label="Calendario de resultados"
                                sx={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    zIndex: 20,
                                    width: 248,
                                    p: 1,
                                    borderRadius: 'sm',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    backgroundColor: 'background.surface',
                                    boxShadow: 'md',
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                                    <IconButton aria-label="Mes anterior" size="sm" variant="plain" color="neutral" onClick={() => setCursor((current) => shiftMonth(current, -1))}>
                                        <ChevronLeft style={{ fontSize: 18 }} />
                                    </IconButton>
                                    <Typography level="body-sm" sx={{ fontWeight: 600, textTransform: 'capitalize' }}>{monthLabel(cursor)}</Typography>
                                    <IconButton aria-label="Mes siguiente" size="sm" variant="plain" color="neutral" onClick={() => setCursor((current) => shiftMonth(current, 1))}>
                                        <ChevronRight style={{ fontSize: 18 }} />
                                    </IconButton>
                                </Box>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.25 }}>
                                    {WEEKDAY_LABELS.map((label) => (
                                        <Typography key={label} level="body-xs" sx={{ textAlign: 'center', color: 'text.tertiary', py: 0.25 }}>
                                            {label}
                                        </Typography>
                                    ))}
                                    {cells.map((cell, index) => {
                                        if (!cell) return <Box key={`empty-${index}`} sx={{ width: 30, height: 30 }} />;
                                        const hasHits = daysWithHits.has(cell.key);
                                        const selected = dayFilter === cell.key;
                                        return (
                                            <IconButton
                                                key={cell.key}
                                                aria-label={`Filtrar por ${cell.day} de ${monthLabel(cursor)}`}
                                                size="sm"
                                                variant={selected ? 'solid' : 'plain'}
                                                color={selected ? 'primary' : 'neutral'}
                                                onClick={() => selectDay(cell.key)}
                                                sx={{
                                                    ...calendarCellSx,
                                                    color: hasHits ? 'text.primary' : 'text.tertiary',
                                                    fontWeight: hasHits ? 700 : 400,
                                                    position: 'relative',
                                                    '&::after': hasHits && !selected ? {
                                                        content: '""',
                                                        position: 'absolute',
                                                        bottom: 3,
                                                        width: 3,
                                                        height: 3,
                                                        borderRadius: '50%',
                                                        backgroundColor: 'primary.400',
                                                    } : undefined,
                                                }}
                                            >
                                                {cell.day}
                                            </IconButton>
                                        );
                                    })}
                                </Box>
                                {dayFilter && (
                                    <>
                                        <Divider sx={{ my: 0.75 }} />
                                        <Box
                                            aria-label="Quitar el filtro de fecha"
                                            role="button"
                                            onClick={() => { setDayFilter(null); setCalendarOpen(false); }}
                                            sx={{ px: 1, py: 0.5, borderRadius: 'xs', cursor: 'pointer', '&:hover': { backgroundColor: 'background.level2' } }}
                                        >
                                            <Typography level="body-xs">Ver todas las fechas</Typography>
                                        </Box>
                                    </>
                                )}
                            </Box>
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
                        query.length > 0 ? (
                            <IconButton aria-label="Limpiar búsqueda" size="sm" variant="plain" color="neutral" onClick={() => setQuery('')}>
                                <X style={{ fontSize: 18 }} />
                            </IconButton>
                        ) : null
                    }
                    sx={{ flexGrow: 1, minWidth: 0 }}
                />
            </Box>

            {selectedDayLabel && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pb: 1, flexShrink: 0 }}>
                    <Typography level="body-xs" sx={{ color: 'primary.300' }}>Filtrando el {selectedDayLabel}</Typography>
                    <Box role="button" aria-label="Quitar el filtro de fecha activo" onClick={() => setDayFilter(null)} sx={{ cursor: 'pointer', display: 'flex' }}>
                        <X style={{ fontSize: 14 }} />
                    </Box>
                </Box>
            )}

            <Divider />

            <Box
                ref={scrollRef}
                onScroll={handleScroll}
                sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}
            >
                {!trimmed && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, px: 3, py: 6, color: 'text.tertiary' }}>
                        <Search style={{ fontSize: 28 }} />
                        <Typography level="body-sm" textAlign="center">Busca en toda la conversación</Typography>
                    </Box>
                )}

                {trimmed && !loading && searched && hits.length === 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, px: 3, py: 6, color: 'text.tertiary' }}>
                        <MessageSquare style={{ fontSize: 28 }} />
                        <Typography level="body-sm" textAlign="center">No se han encontrado mensajes</Typography>
                    </Box>
                )}

                {hits.length > 0 && (
                    <List sx={{ p: 0, '--ListItem-paddingY': '0px', minWidth: 0 }}>
                        {groups.flatMap((group) => [
                            <Box key={`day-${group.key}`} sx={{ px: 2, py: 1, position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'background.surface' }}>
                                <Typography level="body-xs" sx={{ color: 'text.tertiary', fontWeight: 600 }}>
                                    {group.label}
                                </Typography>
                            </Box>,
                            ...group.rows.map((hit) => (
                                <ListItem key={hit.id} sx={{ p: 0, minWidth: 0 }}>
                                    <ListItemButton
                                        aria-label={`Ir al mensaje: ${hit.summary.label}`}
                                        onClick={() => openResult(hit.id)}
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
                                        {hit.isMine
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
                                            {highlightParts(hit.summary.label, trimmed).map((part, index) => (
                                                part.match
                                                    ? <Box component="span" key={index} sx={{ color: 'primary.400', fontWeight: 700 }}>{part.text}</Box>
                                                    : <React.Fragment key={index}>{part.text}</React.Fragment>
                                            ))}
                                        </Typography>
                                    </ListItemButton>
                                </ListItem>
                            )),
                        ])}
                    </List>
                )}

                {trimmed && loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <CircularProgress size="sm" />
                    </Box>
                )}

                {trimmed && !loading && searched && hits.length > 0 && !hasMore && (
                    <Box sx={{ px: 2, py: 1.5 }}>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {hits.length === 1 ? '1 resultado en toda la conversación' : `${hits.length} resultados en toda la conversación`}
                        </Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
};
