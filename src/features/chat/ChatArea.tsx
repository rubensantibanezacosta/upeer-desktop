import React, { useRef } from 'react';
import { Box, Typography } from '@mui/joy';
import { EmptyChat } from './EmptyChat.js';
import { MessageItem } from './message/index.js';

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
    isSystem?: boolean;
}

interface ChatAreaProps {
    chatHistory: ChatMessage[];
    myIp: string;
    contacts: { address: string, name: string }[];
    onReply: (msg: ChatMessage) => void;
    onReact: (msgId: string, emoji: string, remove: boolean) => void;
    onEdit: (msg: ChatMessage) => void;
    onDelete: (msgId: string) => void;
    activeTransfers?: any[];
    isGroup?: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ chatHistory, myIp, contacts, onReply, onReact, onEdit, onDelete, activeTransfers = [], isGroup }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    const getMessageById = (id: string) => chatHistory.find(m => m.id === id);

    const handleScrollToMessage = (id: string) => {
        const element = document.getElementById(`msg-${id}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                p: 2,
                pb: 4,
                gap: 0.75,
                boxSizing: 'border-box'
            }}
        >
            {reversedHistory.map((msg, index) => (
                <Box key={msg.id || index} sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                    {msg.isSystem ? (
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
                    ) : (
                        <MessageItem
                            msg={msg}
                            onReply={onReply}
                            onReact={onReact}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            originalMessage={msg.replyTo ? getMessageById(msg.replyTo)?.message : undefined}
                            activeTransfers={activeTransfers}
                            onScrollToMessage={handleScrollToMessage}
                            isGroup={isGroup}
                        />
                    )}
                </Box>
            ))}
        </Box>
    );
};
