import React from 'react';
import { Box } from '@mui/joy';

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
    if (!reactions || reactions.length === 0) return null;

    const grouped = reactions.reduce((acc: Record<string, number>, r) => {
        acc[r.emoji] = (acc[r.emoji] || 0) + 1;
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
                backgroundColor: 'background.surface',
                borderRadius: 'md',
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: 'sm',
                overflow: 'hidden',
            }}
        >
            {Object.entries(grouped).map(([emoji, count]) => (
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
                        color: 'text.secondary',
                        fontWeight: 600,
                        fontSize: '11px',
                        '&:hover': { backgroundColor: 'background.level1' },
                    }}
                >
                    <span style={{ fontSize: '14px', lineHeight: 1 }}>{emoji}</span>
                    {count > 1 && <span>{count}</span>}
                </Box>
            ))}
        </Box>
    );
};
