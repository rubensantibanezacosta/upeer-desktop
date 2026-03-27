import React, { useRef } from 'react';
import { Box, IconButton } from '@mui/joy';
import { EmptyChat } from './EmptyChat.js';
import { MessageItem } from './message/MessageItem.js';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useNavigationStore } from '../../store/useNavigationStore.js';
import { useChatStore } from '../../store/useChatStore.js';
import type { FileTransfer } from '../../hooks/fileTransferTypes.js';
import type { ChatMessage, Contact, TransferMessageUpdates } from '../../types/chat.js';
import { ChatDateSeparator, ChatSystemMessage, highlightChatMessage } from './chatAreaSupport.js';

interface MediaClickPayload {
    url: string;
    name: string;
    mimeType: string;
    fileId: string;
}

interface ChatAreaProps {
    chatHistory: ChatMessage[];
    myIp: string;
    contacts: Pick<Contact, 'address' | 'name' | 'upeerId'>[];
    onReply: (msg: ChatMessage) => void;
    onReact: (msgId: string, emoji: string, remove: boolean) => void;
    onEdit: (msg: ChatMessage) => void;
    onDelete: (msgId: string) => void;
    onForward?: (msg: ChatMessage) => void;
    activeTransfers?: FileTransfer[];
    onRetryMessage?: (msgId: string) => void;
    onRetryTransfer?: (fileId: string) => void;
    onCancelTransfer?: (fileId: string) => void;
    onMediaClick?: (media: MediaClickPayload) => void;
    isGroup?: boolean;
    onTransferStateChange?: (fileId: string, updates: TransferMessageUpdates) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ chatHistory, myIp: _myIp, contacts: _contacts, onReply, onReact, onEdit, onDelete, onForward, activeTransfers = [], onRetryMessage, onRetryTransfer, onCancelTransfer, onMediaClick, isGroup, onTransferStateChange }) => {
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

    const getReplySenderName = (replyTo?: string) => {
        if (!replyTo) return undefined;
        const original = getMessageById(replyTo);
        if (!original) return undefined;
        if (original.isMine) return 'Tú';
        return original.senderName
            || _contacts.find((contact) => contact.upeerId === original.senderUpeerId || contact.upeerId === original.upeerId)?.name
            || _contacts[0]?.name
            || 'Contacto';
    };

    const handleScrollToMessage = (id: string) => {
        highlightChatMessage(id);
    };

    if (chatHistory.length === 0) {
        return (
            <Box sx={{
                flexGrow: 1,
                backgroundColor: 'background.body',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <EmptyChat />
            </Box>
        );
    }

    const reversedHistory = [...chatHistory].reverse();

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
                                originalSenderName={getReplySenderName(msg.replyTo)}
                                activeTransfers={activeTransfers}
                                onScrollToMessage={handleScrollToMessage}
                                onRetryMessage={onRetryMessage}
                                onRetryTransfer={onRetryTransfer}
                                onCancelTransfer={onCancelTransfer}
                                onMediaClick={onMediaClick}
                                isGroup={isGroup}
                                isFirstInGroupChain={isFirstInGroupChain}
                                isLastInGroupChain={isLastInGroupChain}
                                onTransferStateChange={onTransferStateChange}
                            />
                        ) : (
                            <ChatSystemMessage message={msg.message} />
                        )}
                        {showSeparator && (
                            <ChatDateSeparator date={msg.date} />
                        )}
                    </React.Fragment>
                );
            })}

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
