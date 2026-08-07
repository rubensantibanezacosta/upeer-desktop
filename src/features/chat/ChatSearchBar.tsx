import React, { useEffect, useMemo, useState } from 'react';
import { Box, Input, List, ListItem, ListItemButton, ListItemContent, Typography, IconButton, Chip, CircularProgress } from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { useNavigationStore } from '../../store/useNavigationStore.js';

interface ChatSearchBarProps {
    conversationKey: string;
    onClose: () => void;
}

interface SearchResult {
    id: string;
    message: string;
    timestamp: number;
    isMine: boolean;
}

const excerpt = (raw: string): string => {
    if (raw.startsWith('{') && raw.endsWith('}')) {
        return '📎 Archivo adjunto';
    }
    const singleLine = raw.replace(/\s+/g, ' ').trim();
    return singleLine.length > 140 ? `${singleLine.slice(0, 140)}…` : singleLine;
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
            window.upeer.searchMessages(trimmed)
                .then((rows) => {
                    if (cancelled) return;
                    const filtered = (rows || [])
                        .filter((row) => row.id)
                        .filter((row) => row.chatUpeerId === conversationKey)
                        .filter((row) => !row.isDeleted)
                        .map((row) => ({
                            id: row.id as string,
                            message: row.message || '',
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
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Input
                    aria-label="Buscar mensajes en esta conversación"
                    size="sm"
                    startDecorator={<SearchIcon sx={{ fontSize: 18 }} />}
                    placeholder="Buscar mensajes…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    autoFocus
                    endDecorator={
                        <IconButton aria-label="Cerrar búsqueda" size="sm" variant="plain" color="neutral" onClick={onClose}>
                            <CloseIcon sx={{ fontSize: 18 }} />
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
                <List sx={{ p: 0, '--ListItem-paddingY': '0px', maxHeight: 280, overflowY: 'auto' }}>
                    {results.map((result) => (
                        <ListItem key={result.id} sx={{ p: 0 }}>
                            <ListItemButton
                                aria-label={`Ir al mensaje: ${excerpt(result.message)}`}
                                onClick={() => openResult(result.id)}
                                sx={{ px: 1, py: 0.75, borderRadius: 'sm', gap: 1 }}
                            >
                                <ChatBubbleOutlineIcon sx={{ fontSize: 18, color: 'text.tertiary', flexShrink: 0 }} />
                                <ListItemContent sx={{ minWidth: 0 }}>
                                    <Typography level="body-xs" noWrap sx={{ color: result.isMine ? 'primary.500' : 'neutral' }}>
                                        {result.isMine ? 'Tú' : 'Contacto'} · {fmtTime(result.timestamp)}
                                    </Typography>
                                    <Typography level="body-sm" noWrap color="neutral">
                                        {excerpt(result.message)}
                                    </Typography>
                                </ListItemContent>
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            )}
        </Box>
    );
};