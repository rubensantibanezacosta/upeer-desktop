import React, { useMemo } from 'react';
import {
    Box,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    Typography,
} from '@mui/joy';
import { ArrowLeft, CheckCheck, MessageSquare, Paperclip, Mic, Star, UserRound } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore.js';
import { useChatActionsStore } from '../../store/useChatActionsStore.js';
import { useNavigationStore } from '../../store/useNavigationStore.js';
import { collectStarred, type StarredEntry } from './starredMessages.js';
import { groupByDay } from './chatSearchResults.js';
import type { SearchResultKind } from './searchResultMeta.js';

interface ChatStarredViewProps {
    onBack: () => void;
}

const KIND_ICONS: Record<SearchResultKind, React.ReactNode> = {
    card: <UserRound style={{ fontSize: 16 }} />,
    file: <Paperclip style={{ fontSize: 16 }} />,
    text: <MessageSquare style={{ fontSize: 16 }} />,
    voice: <Mic style={{ fontSize: 16 }} />,
};

const rowTextSx = {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    wordBreak: 'break-word',
} as const;

const StarredRow: React.FC<{ entry: StarredEntry; onOpen: (id: string) => void; onUnstar: (id: string) => void }> = ({ entry, onOpen, onUnstar }) => (
    <ListItem sx={{ p: 0, minWidth: 0 }}>
        <ListItemButton
            aria-label={`Ir al mensaje destacado: ${entry.summary.label}`}
            onClick={() => onOpen(entry.id)}
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
            <Box sx={{ display: 'flex', mt: 0.25, flexShrink: 0, color: entry.isMine ? 'primary.400' : 'text.tertiary' }}>
                {entry.isMine ? <CheckCheck style={{ fontSize: 16 }} /> : KIND_ICONS[entry.summary.kind]}
            </Box>
            <Typography level="body-sm" sx={rowTextSx}>{entry.summary.label}</Typography>
            <IconButton
                aria-label="Quitar de destacados"
                size="sm"
                variant="plain"
                color="neutral"
                onClick={(event) => {
                    event.stopPropagation();
                    onUnstar(entry.id);
                }}
                sx={{ flexShrink: 0, color: 'warning.400' }}
            >
                <Star fill="currentColor" style={{ fontSize: 16 }} />
            </IconButton>
        </ListItemButton>
    </ListItem>
);

export const ChatStarredView: React.FC<ChatStarredViewProps> = ({ onBack }) => {
    const chatHistory = useChatStore((state) => state.chatHistory);
    const messagePrefs = useChatActionsStore((state) => state.messagePrefs);
    const toggleMessage = useChatActionsStore((state) => state.toggleMessage);
    const setPendingScrollMsgId = useNavigationStore((state) => state.setPendingScrollMsgId);
    const entries = useMemo(() => collectStarred(chatHistory ?? [], messagePrefs), [chatHistory, messagePrefs]);
    const groups = useMemo(() => groupByDay(entries), [entries]);

    const open = (id: string) => {
        setPendingScrollMsgId(id);
        onBack();
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
            <Box sx={{ height: '60px', px: 1, display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                <IconButton aria-label="Volver a la ficha del contacto" size="sm" variant="plain" color="neutral" onClick={onBack}>
                    <ArrowLeft style={{ fontSize: 20 }} />
                </IconButton>
                <Typography level="title-md" sx={{ fontWeight: 600 }}>Mensajes destacados</Typography>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', ml: 'auto', mr: 1 }}>
                    {entries.length === 1 ? '1 mensaje' : `${entries.length} mensajes`}
                </Typography>
            </Box>

            <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
                {entries.length === 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, px: 3, py: 6, color: 'text.tertiary' }}>
                        <Star style={{ fontSize: 28 }} />
                        <Typography level="body-sm" textAlign="center">Aún no hay mensajes destacados</Typography>
                        <Typography level="body-xs" textAlign="center">Pulsa con el botón derecho en un mensaje y elige «Destacar»</Typography>
                    </Box>
                ) : (
                    <List sx={{ p: 0, '--ListItem-paddingY': '0px', minWidth: 0 }}>
                        {groups.flatMap((group) => [
                            <Box key={`day-${group.key}`} sx={{ px: 2, py: 1, position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'background.surface' }}>
                                <Typography level="body-xs" sx={{ color: 'text.tertiary', fontWeight: 600 }}>
                                    {group.label}
                                </Typography>
                            </Box>,
                            ...group.rows.map((entry) => (
                                <StarredRow key={entry.id} entry={entry} onOpen={open} onUnstar={(id) => toggleMessage(id, 'starred')} />
                            )),
                        ])}
                    </List>
                )}
            </Box>
        </Box>
    );
};
