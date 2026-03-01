import React, { useRef, useEffect } from 'react';
import { Box } from '@mui/joy';
import { EmptyChat } from './EmptyChat.js';
import { MessageItem } from './MessageItem.js';

interface ChatMessage {
    id?: string;
    revelnestId: string;
    isMine: boolean;
    message: string;
    status: string;
    timestamp: string;
    replyTo?: string;
    isDeleted?: boolean;
    isEdited?: boolean;
    reactions?: Array<{ revelnestId: string; emoji: string }>;
}

interface ChatAreaProps {
    chatHistory: ChatMessage[];
    myIp: string;
    contacts: { address: string, name: string }[];
    onReply: (msg: ChatMessage) => void;
    onReact: (msgId: string, emoji: string, remove: boolean) => void;
    onEdit: (msg: ChatMessage) => void;
    onDelete: (msgId: string) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ chatHistory, myIp, contacts, onReply, onReact, onEdit, onDelete }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [chatHistory]);

    const getMessageById = (id: string) => chatHistory.find(m => m.id === id);

    return (
        <Box
            ref={scrollRef}
            sx={{
                flexGrow: 1,
                p: { xs: 2.5, md: 4 },
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
                backgroundColor: 'background.body',
                backgroundImage: 'radial-gradient(var(--joy-palette-neutral-300, #d1d1d1) 0.5px, transparent 0.5px)',
                backgroundSize: '20px 20px',
            }}
        >
            {chatHistory.length === 0 ? (
                <EmptyChat />
            ) : (
                chatHistory.map((msg, idx) => (
                    <MessageItem
                        key={msg.id || idx}
                        msg={msg}
                        onReply={onReply}
                        onReact={onReact}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        originalMessage={msg.replyTo ? getMessageById(msg.replyTo)?.message : undefined}
                    />
                ))
            )}
        </Box>
    );
};
