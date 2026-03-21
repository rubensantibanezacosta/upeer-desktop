import React, { useRef } from 'react';
import { Box, IconButton, Typography } from '@mui/joy';
import { EmptyChat } from './EmptyChat.js';
import { MessageItem } from './message/MessageItem.js';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useNavigationStore } from '../../store/useNavigationStore.js';
import { useChatStore } from '../../store/useChatStore.js';

interface ChatMessage {
    id?: string;
    upeerId: string;
    isMine: boolean;
    message: string;
    status: string;
    timestamp: string;
    replyTo?: string;
    isDeleted?: boolean;
    isEdited?: boolean;
    reactions?: Array<{ upeerId: string; emoji: string }>;
    senderName?: string;
    senderUpeerId?: string;
    senderAvatar?: string;
    isSystem?: boolean;
    date: number;
}

interface ChatAreaProps {
    chatHistory: ChatMessage[];
    myIp: string;
    contacts: { address: string, name: string }[];
    onReply: (msg: ChatMessage) => void;
    onReact: (msgId: string, emoji: string, remove: boolean) => void;
    onEdit: (msg: ChatMessage) => void;
    onDelete: (msgId: string) => void;
    onForward?: (msg: ChatMessage) => void;
    activeTransfers?: any[];
    onRetryTransfer?: (fileId: string) => void;
    onCancelTransfer?: (fileId: string) => void;
    onMediaClick?: (media: { url: string; name: string; mimeType: string; fileId: string }) => void;
    isGroup?: boolean;
    onTransferStateChange?: (fileId: string, updates: any) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ chatHistory, myIp: _myIp, contacts: _contacts, onReply, onReact, onEdit, onDelete, onForward, activeTransfers = [], onRetryTransfer, onCancelTransfer, onMediaClick, isGroup, onTransferStateChange }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showScrollButton, setShowScrollButton] = React.useState(false);
    const lastMsgCount = useRef(chatHistory.length);
    const { pendingScrollMsgId, setPendingScrollMsgId } = useNavigationStore();
    const { isWindowedHistory, reloadLatestHistory } = useChatStore();
    const pendingScrollRef = useRef(pendingScrollMsgId);
    pendingScrollRef.current = pendingScrollMsgId;

    React.useLayoutEffect(() => {
        if (!pendingScrollMsgId) return;
        if (chatHistory.length === 0) return;
        const msg = chatHistory.find(m => m.id === pendingScrollMsgId);
        if (!msg) return;
        const element = document.getElementById(`msg-${pendingScrollMsgId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const bubble = element.querySelector('.MuiSheet-root') as HTMLElement;
            if (bubble) {
                bubble.style.outline = '2px solid var(--joy-palette-primary-500)';
                bubble.style.outlineOffset = '2px';
                setTimeout(() => { bubble.style.outline = ''; bubble.style.outlineOffset = ''; }, 1500);
            }
            setPendingScrollMsgId(null);
        }
    }, [chatHistory, pendingScrollMsgId, setPendingScrollMsgId]);

    React.useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        const handleScroll = () => {
            const isNearBottom = Math.abs(container.scrollTop) < 50;
            setShowScrollButton(!isNearBottom);
            if (isWindowedHistory && isNearBottom) reloadLatestHistory();
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [isWindowedHistory, reloadLatestHistory]);

    const scrollToBottom = () => {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    React.useLayoutEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        const isNewMessage = chatHistory.length > lastMsgCount.current;
        lastMsgCount.current = chatHistory.length;

        if (!isNewMessage) return;
        if (pendingScrollRef.current) return;

        const lastMessage = chatHistory[chatHistory.length - 1];
        if (!lastMessage) return;

        const isAtBottom = container.scrollTop > -10;
        if (lastMessage.isMine || isAtBottom) {
            container.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [chatHistory]);

    const getMessageById = (id: string) => chatHistory.find(m => m.id === id);

    const handleScrollToMessage = (id: string) => {
        const element = document.getElementById(`msg-${id}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Highlight effect instead of shadow
            const sheet = element.querySelector('.MuiSheet-root');
            if (sheet) {
                sheet.classList.remove('highlight-message-active');
                void (sheet as HTMLElement).offsetWidth; // Force reflow
                sheet.classList.add('highlight-message-active');
            }
        }
    };

    if (chatHistory.length === 0) {
        return (
            <Box sx={{
                flexGrow: 1,
                backgroundColor: 'background.body',
                backgroundImage: 'radial-gradient(var(--joy-palette-neutral-300, #d1d1d1) 0.5px, transparent 0.5px)',
                backgroundSize: '20px 20px',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <EmptyChat />
            </Box>
        );
    }

    // We use column-reverse to force the scroll to start at the bottom naturally.
    // This requires us to render the history in reverse order.
    const reversedHistory = [...chatHistory].reverse();

    const formatDateLabel = (date: number) => {
        const d = new Date(date);
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);

        if (d.toDateString() === now.toDateString()) return 'Hoy';
        if (d.toDateString() === yesterday.toDateString()) return 'Ayer';

        // If same year, don't show year
        if (d.getFullYear() === now.getFullYear()) {
            return d.toLocaleDateString([], { day: '2-digit', month: 'long' });
        }
        return d.toLocaleDateString([], { day: '2-digit', month: 'long', year: 'numeric' });
    };

    return (
        <Box
            ref={scrollRef}
            sx={{
                flexGrow: 1,
                width: '100%',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column-reverse',
                backgroundColor: 'background.body',
                backgroundImage: 'radial-gradient(var(--joy-palette-neutral-300, #d1d1d1) 0.5px, transparent 0.5px)',
                backgroundSize: '20px 20px',
                px: 4,
                pt: 2,
                pb: 4,
                gap: 0.4,
                boxSizing: 'border-box'
            }}
        >
            {reversedHistory.map((msg, index) => {
                const nextMsg = reversedHistory[index + 1];
                const prevMsg = index > 0 ? reversedHistory[index - 1] : undefined;
                const showSeparator = !nextMsg || new Date(msg.date).toDateString() !== new Date(nextMsg.date).toDateString();

                const sameAsPrev = prevMsg && !prevMsg.isSystem && prevMsg.isMine === msg.isMine && prevMsg.senderUpeerId === msg.senderUpeerId;
                const sameAsNext = nextMsg && !nextMsg.isSystem && nextMsg.isMine === msg.isMine && nextMsg.senderUpeerId === msg.senderUpeerId;
                const isFirstInGroupChain = !sameAsNext;
                const isLastInGroupChain = !sameAsPrev;

                return (
                    <React.Fragment key={msg.id || index}>
                        {!msg.isSystem ? (
                            <MessageItem
                                msg={msg}
                                onReply={onReply}
                                onReact={onReact}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                onForward={onForward}
                                originalMessage={msg.replyTo ? getMessageById(msg.replyTo)?.message : undefined}
                                originalSenderName={msg.replyTo ? (getMessageById(msg.replyTo)?.isMine ? 'Tú' : getMessageById(msg.replyTo)?.senderName) : undefined}
                                activeTransfers={activeTransfers}
                                onScrollToMessage={handleScrollToMessage}
                                onRetryTransfer={onRetryTransfer}
                                onCancelTransfer={onCancelTransfer}
                                onMediaClick={onMediaClick}
                                isGroup={isGroup}
                                isFirstInGroupChain={isFirstInGroupChain}
                                isLastInGroupChain={isLastInGroupChain}
                                onTransferStateChange={onTransferStateChange}
                            />
                        ) : (
                            <Box sx={{ display: 'flex', justifyContent: 'center', my: 0.5 }}>
                                <Typography
                                    level="body-xs"
                                    sx={{
                                        px: 1.5, py: 0.4,
                                        borderRadius: 'xl',
                                        backgroundColor: 'background.level2',
                                        color: 'text.tertiary',
                                        fontStyle: 'italic',
                                        userSelect: 'none',
                                    }}
                                >
                                    {msg.message}
                                </Typography>
                            </Box>
                        )}
                        {showSeparator && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, mb: 1 }}>
                                <Box sx={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
                                    <Typography
                                        level="body-xs"
                                        sx={{
                                            px: 2, py: 0.5,
                                            borderRadius: 'lg',
                                            backgroundColor: 'background.level1',
                                            color: 'text.secondary',
                                            fontWeight: 600,
                                            fontSize: '11px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            zIndex: 1
                                        }}
                                    >
                                        {formatDateLabel(msg.date)}
                                    </Typography>
                                    <Box sx={{
                                        position: 'absolute', top: '50%', left: 0, right: 0,
                                        height: '1px', backgroundColor: 'divider', zIndex: 0
                                    }} />
                                </Box>
                            </Box>
                        )}
                    </React.Fragment>
                );
            })}

            {/* Scroll to bottom floating button */}
            {showScrollButton && (
                <IconButton
                    variant="soft"
                    color="neutral"
                    size="md"
                    onClick={scrollToBottom}
                    sx={{
                        position: 'absolute',
                        bottom: 24,
                        right: 48,
                        borderRadius: 'md',
                        boxShadow: 'md',
                        zIndex: 1100,
                    }}
                >
                    <KeyboardArrowDownIcon />
                </IconButton>
            )}
        </Box>
    );
};
