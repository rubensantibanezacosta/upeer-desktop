import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box,
    CircularProgress,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    Typography,
} from '@mui/joy';
import { ArrowLeft, MessageSquare, Paperclip, Mic, Star, UserRound } from 'lucide-react';
import { useChatActionsStore } from '../../store/useChatActionsStore.js';
import { useNavigationStore } from '../../store/useNavigationStore.js';
import { summarizeSearchResult, type SearchResultKind } from './searchResultMeta.js';
import { groupStarredByChat, starredIdsOf, toStarredRows, type StarredChatGroup, type StarredChatName, type StarredRow } from './starredGlobal.js';
import { formatMessageTime } from '../../utils/dateTime.js';

interface GlobalStarredViewProps {
    contacts: StarredChatName[];
    groups: StarredChatName[];
    onOpenChat: (chatId: string) => void;
    onBack: () => void;
}

const KIND_ICONS: Record<SearchResultKind, React.ReactNode> = {
    card: <UserRound style={{ fontSize: 15 }} />,
    file: <Paperclip style={{ fontSize: 15 }} />,
    text: <MessageSquare style={{ fontSize: 15 }} />,
    voice: <Mic style={{ fontSize: 15 }} />,
};

const rowTextSx = {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    wordBreak: 'break-word',
} as const;

const ChatSection: React.FC<{ group: StarredChatGroup; onOpen: (row: { id: string; chatUpeerId: string }) => void }> = ({ group, onOpen }) => (
    <>
        <Box sx={{ px: 2, py: 1, position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'background.surface', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography level="body-xs" sx={{ color: 'text.tertiary', fontWeight: 700, flexGrow: 1, minWidth: 0 }} noWrap>
                {group.name}
            </Typography>
            <Typography level="body-xs" sx={{ color: 'text.tertiary', flexShrink: 0 }}>
                {group.rows.length === 1 ? '1 mensaje' : `${group.rows.length} mensajes`}
            </Typography>
        </Box>
        {group.rows.map((row) => {
            const summary = summarizeSearchResult(row.message);
            return (
                <ListItem key={row.id} sx={{ p: 0, minWidth: 0 }}>
                    <ListItemButton
                        aria-label={`Ir al mensaje destacado de ${group.name}: ${summary.label}`}
                        onClick={() => onOpen(row)}
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
                        <Box sx={{ display: 'flex', mt: 0.25, flexShrink: 0, color: row.isMine ? 'primary.400' : 'text.tertiary' }}>
                            {KIND_ICONS[summary.kind]}
                        </Box>
                        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flexGrow: 1, flexBasis: 0 }}>
                            <Typography level="body-sm" sx={rowTextSx}>{summary.label}</Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>{formatMessageTime(row.timestamp)}</Typography>
                        </Box>
                    </ListItemButton>
                </ListItem>
            );
        })}
    </>
);

export const GlobalStarredView: React.FC<GlobalStarredViewProps> = ({ contacts, groups, onOpenChat, onBack }) => {
    const messagePrefs = useChatActionsStore((state) => state.messagePrefs);
    const setPendingScrollMsgId = useNavigationStore((state) => state.setPendingScrollMsgId);
    const [rows, setRows] = useState<StarredRow[]>([]);
    const [loading, setLoading] = useState(false);
    const ids = useMemo(() => starredIdsOf(messagePrefs), [messagePrefs]);

    useEffect(() => {
        if (ids.length === 0) {
            setRows([]);
            setLoading(false);
            return;
        }
        const api = window.upeer as { getMessagesByIds?: (ids: string[]) => Promise<unknown[]> } | undefined;
        if (typeof api?.getMessagesByIds !== 'function') {
            setRows([]);
            return;
        }
        let cancelled = false;
        setLoading(true);
        Promise.resolve(api.getMessagesByIds(ids))
            .then((raw) => {
                if (cancelled) return;
                setRows(toStarredRows(raw));
            })
            .catch(() => {
                if (cancelled) return;
                setRows([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [ids]);

    const chats = useMemo(() => groupStarredByChat(rows, contacts, groups), [rows, contacts, groups]);
    const total = rows.length;

    const open = useCallback((row: { id: string; chatUpeerId: string }) => {
        setPendingScrollMsgId(row.id);
        onOpenChat(row.chatUpeerId);
    }, [onOpenChat, setPendingScrollMsgId]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
            <Box sx={{ height: '60px', px: 2, display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                <IconButton aria-label="Volver a los chats" size="sm" variant="plain" color="neutral" onClick={onBack}>
                    <ArrowLeft style={{ fontSize: 20 }} />
                </IconButton>
                <Typography level="title-md" sx={{ fontWeight: 600, flexGrow: 1 }}>Mensajes destacados</Typography>
                {total > 0 && (
                    <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {total === 1 ? '1 mensaje' : `${total} mensajes`}
                    </Typography>
                )}
            </Box>

            <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                        <CircularProgress size="sm" />
                    </Box>
                )}

                {!loading && total === 0 && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, px: 3, py: 6, color: 'text.tertiary' }}>
                        <Star style={{ fontSize: 28 }} />
                        <Typography level="body-sm" textAlign="center">No hay mensajes destacados</Typography>
                        <Typography level="body-xs" textAlign="center">Abre un chat, pulsa el menú de un mensaje y elige «Destacar»</Typography>
                    </Box>
                )}

                {total > 0 && (
                    <List sx={{ p: 0, '--ListItem-paddingY': '0px', minWidth: 0 }}>
                        {chats.flatMap((chat) => [
                            <ChatSection key={`chat-${chat.chatId}`} group={chat} onOpen={open} />,
                        ])}
                    </List>
                )}
            </Box>
        </Box>
    );
};
