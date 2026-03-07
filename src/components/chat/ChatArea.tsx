import React, { useRef, useEffect, forwardRef } from 'react';
import { Box } from '@mui/joy';
import { EmptyChat } from './EmptyChat.js';
import { MessageItem } from './MessageItem.js';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';

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
    activeTransfers?: any[];
}

// Scroller component that matches the original styling
const Scroller = forwardRef<HTMLDivElement, any>(({ style, ...props }, ref) => (
    <div
        {...props}
        ref={ref}
        style={{
            ...style,
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            backgroundColor: 'var(--joy-palette-background-body)',
            backgroundImage: 'radial-gradient(var(--joy-palette-neutral-300, #d1d1d1) 0.5px, transparent 0.5px)',
            backgroundSize: '20px 20px',
        }}
    />
));

// List component to add padding and gap
const List = forwardRef<HTMLDivElement, any>(({ style, ...props }, ref) => (
    <div
        {...props}
        ref={ref}
        style={{
            ...style,
            width: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '24px', // Standardized padding
        }}
    />
));

// Item component to ensure the wrapper is a flex container for alignment
const Item = ({ children, ...props }: any) => (
    <div
        {...props}
        style={{
            ...props.style,
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
        }}
    >
        {children}
    </div>
);

export const ChatArea: React.FC<ChatAreaProps> = ({ chatHistory, myIp, contacts, onReply, onReact, onEdit, onDelete, activeTransfers = [] }) => {
    const virtuosoRef = useRef<VirtuosoHandle>(null);

    const getMessageById = (id: string) => chatHistory.find(m => m.id === id);

    const handleScrollToMessage = (id: string) => {
        const index = chatHistory.findIndex(m => m.id === id);
        if (index !== -1 && virtuosoRef.current) {
            virtuosoRef.current.scrollToIndex({
                index,
                align: 'center',
                behavior: 'smooth'
            });
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

    return (
        <Virtuoso
            ref={virtuosoRef}
            data={chatHistory}
            followOutput="auto"
            initialTopMostItemIndex={chatHistory.length - 1}
            style={{ flexGrow: 1, width: '100%' }}
            components={{
                Scroller,
                List,
                Item
            }}
            itemContent={(index, msg) => (
                <MessageItem
                    key={msg.id || index}
                    msg={msg}
                    onReply={onReply}
                    onReact={onReact}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    originalMessage={msg.replyTo ? getMessageById(msg.replyTo)?.message : undefined}
                    activeTransfers={activeTransfers}
                    onScrollToMessage={handleScrollToMessage}
                />
            )}
        />
    );
};
