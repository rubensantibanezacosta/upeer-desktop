import React, { useEffect, useMemo, useState } from 'react';
import { Box, Input, List, ListItem, ListItemButton, ListItemContent, Typography, IconButton, Chip, CircularProgress } from '@mui/joy';
import { Search, X, MessageSquare, Paperclip, Mic, UserRound } from 'lucide-react';
import { useNavigationStore } from '../../store/useNavigationStore.js';
import { summarizeSearchResult, type SearchResultKind } from './searchResultMeta.js';

interface ChatSearchBarProps {
    conversationKey: string;
    onClose: () => void;
}

interface SearchResult {
    id: string;
    message: string;
    summary: ReturnType<typeof summarizeSearchResult>;
    timestamp: number;
    isMine: boolean;
}

const IN_CHAT_SEARCH_LIMIT = 50;

const RESULT_ICONS: Record<SearchResultKind, React.ComponentType<{ style?: React.CSSProperties }>> = {
    text: MessageSquare,
    file: Paperclip,
    voice: Mic,
    card: UserRound,
};

const fmtTime = (ts: number): string =>
    new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

export const ChatSearchBar: React.FC<ChatSearchBarProps> = ({ conversationKey, onClose }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const setPendingScrollMsgId = useNavigationStore((s) => s.setPendingScrollMsgId);

    useEffect(() => {
        const trimmed = query.trim();
        if (!trimmed) {
            setResults([]);
            setSearched(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        const timer = window.setTimeout(() => {
            window.upeer.searchMessages(trimmed, IN_CHAT_SEARCH_LIMIT, 0)
                .then((rows) => {
                    if (cancelled) return;
                    const filtered = (rows || [])
                        .filter((row) => row.id)
                        .filter((row) => row.chatUpeerId === conversationKey)
                        .filter((row) => !row.isDeleted)
                        .map((row) => ({
                            id: row.id as string,
                            message: row.message || '',
                            summary: summarizeSearchResult(row.message || ''),
                            timestamp: Number(row.timestamp),
                            isMine: !!row.isMine,
                        }));
                    setResults(filtered);
                    setSearched(true);
                })
                .catch((err) => {
                    if (!cancelled) {
                        console.error('Error al buscar mensajes', err);
                        setResults([]);
                        setSearched(true);
                    }
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

    const resultCount = useMemo(() => results.length, [results]);

    const openResult = (id: string) => {
        setPendingScrollMsgId(id);
        onClose();
    };

    return (
        <Box sx={{
            borderBottom: '1px solid',
            borderColor: 'divider',
            backgroundColor: 'background.surface',
            px: 1.5,
            py: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            flexShrink: 0,
            minWidth: 0,
            overflow: 'hidden',
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                <Input
                    aria-label="Buscar mensajes en esta conversación"
                    size="sm"
                    startDecorator={<Search style={{ fontSize: 18 }} />}
                    placeholder="Buscar mensajes…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    autoFocus
                    endDecorator={
                        <IconButton aria-label="Cerrar búsqueda" size="sm" variant="plain" color="neutral" onClick={onClose}>
                            <X style={{ fontSize: 18 }} />
                        </IconButton>
                    }
                    sx={{ flexGrow: 1 }}
                />
            </Box>

            {query.trim() && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 24 }}>
                    {loading ? (
                        <CircularProgress size="sm" />
                    ) : searched ? (
                        <Chip size="sm" variant="soft" color={resultCount > 0 ? 'primary' : 'neutral'}>
                            {resultCount > 0 ? `${resultCount} resultado${resultCount !== 1 ? 's' : ''}` : 'Sin resultados'}
                        </Chip>
                    ) : null}
                </Box>
            )}

            {results.length > 0 && (
                <List sx={{ p: 0, '--ListItem-paddingY': '0px', maxHeight: 280, overflowY: 'auto', overflowX: 'hidden', minWidth: 0, width: '100%' }}>
                    {results.map((result) => {
                        const Icon = RESULT_ICONS[result.summary.kind];
                        return (
                            <ListItem key={result.id} sx={{ p: 0, minWidth: 0 }}>
                                <ListItemButton
                                    aria-label={`Ir al mensaje: ${result.summary.label}`}
                                    onClick={() => openResult(result.id)}
                                    sx={{ px: 1, py: 0.75, borderRadius: 'sm', gap: 1, minWidth: 0, overflow: 'hidden', alignItems: 'flex-start' }}
                                >
                                    <Icon style={{ fontSize: 18, marginTop: 2, color: 'var(--joy-palette-text-tertiary)', flexShrink: 0 }} />
                                    <ListItemContent sx={{ minWidth: 0, overflow: 'hidden' }}>
                                        <Typography level="body-xs" noWrap sx={{ color: result.isMine ? 'primary.500' : 'neutral' }}>
                                            {result.isMine ? 'Tú' : 'Contacto'} · {fmtTime(result.timestamp)}
                                        </Typography>
                                        <Typography level="body-sm" noWrap color="neutral" sx={{ display: 'block' }}>
                                            {result.summary.label}
                                        </Typography>
                                    </ListItemContent>
                                </ListItemButton>
                            </ListItem>
                        );
                    })}
                </List>
            )}
        </Box>
    );
};