import React from 'react';
import { Box } from '@mui/joy';
import { useChatStore } from '../../../store/useChatStore.js';

interface Reaction {
    upeerId: string;
    emoji: string;
}

interface MessageReactionsProps {
    reactions: Reaction[];
    isMe: boolean;
    onRemoveReact: (emoji: string) => void;
}

export const MessageReactions: React.FC<MessageReactionsProps> = ({ reactions, isMe, onRemoveReact }) => {
    const myUpeerId = useChatStore((state: any) => state.myIdentity?.upeerId);

    if (!reactions || reactions.length === 0) return null;

    const grouped = reactions.reduce((acc: Record<string, { count: number, hasMine: boolean }>, r) => {
        if (!acc[r.emoji]) {
            acc[r.emoji] = { count: 0, hasMine: false };
        }
        acc[r.emoji].count += 1;
        if (r.upeerId === myUpeerId) {
            acc[r.emoji].hasMine = true;
        }
        return acc;
    }, {});

    return (
        <Box
            sx={{
                display: 'flex',
                flexWrap: 'nowrap',
                width: 'max-content',
                gap: 0,
                position: 'absolute',
                bottom: -20,
                [isMe ? 'right' : 'left']: 8,
                zIndex: 2,
                borderRadius: 'md',
                overflow: 'hidden',
                backgroundColor: isMe ? 'background.surface' : 'background.level2',
                border: isMe ? '1px solid' : 'none',
                borderColor: isMe ? 'divider' : 'transparent',
                boxShadow: isMe ? 'sm' : 'none',
                backdropFilter: isMe ? 'blur(8px)' : 'none',
            hj
            }}
        >
            {Object.entries(grouped).map(([emoji, { count, hasMine }]) => (
                <Box
                    key={emoji}
                    onClick={() => onRemoveReact(emoji)}
                    sx={{
                        px: 0.75,
                        height: '22px',
                        minWidth: '22px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 0.5,
                        cursor: 'pointer',
                        color: hasMine ? 'primary.plainColor' : 'text.secondary',
                        backgroundColor: hasMine ? 'primary.softBg' : 'transparent',
                        fontWeight: 600,
                        fontSize: '11px',
                        transition: 'all 0.2s',
                        '&:hover': {
                            backgroundColor: hasMine ? 'primary.softHoverBg' : 'background.level1'
                        },
                    }}
                >
                    <span style={{ fontSize: '14px', lineHeight: 1 }}>{emoji}</span>
                    {count > 1 && <span>{count}</span>}
                </Box>
            ))}
        </Box>
    );
};
