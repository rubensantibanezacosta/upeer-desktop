import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/joy';
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined';
import { MessageContextMenu } from './MessageContextMenu.js';
import { QUICK_EMOJIS, getQuickEmojiLabel } from './messageItemSupport.js';
import type { ChatMessage } from '../../../types/chat.js';

interface MessageItemActionsProps {
    msg: ChatMessage;
    isHovered: boolean;
    emojiOpen: boolean;
    setEmojiOpen: React.Dispatch<React.SetStateAction<boolean>>;
    emojiPickerRef: React.RefObject<HTMLDivElement | null>;
    isMe: boolean;
    isFile: boolean;
    fileCompleted: boolean;
    canEdit: boolean;
    onReact: (msgId: string, emoji: string, remove: boolean) => void;
    onReply: () => void;
    onEdit?: () => void;
    onForward?: () => void;
    onDelete: () => void;
}

export const MessageItemActions: React.FC<MessageItemActionsProps> = ({
    msg,
    isHovered,
    emojiOpen,
    setEmojiOpen,
    emojiPickerRef,
    isMe,
    isFile,
    fileCompleted,
    canEdit,
    onReact,
    onReply,
    onEdit,
    onForward,
    onDelete,
}) => {
    if (msg.isDeleted) {
        return null;
    }

    return (
        <Box sx={{ opacity: isHovered || emojiOpen ? 1 : 0, transition: 'opacity 0.1s', display: 'flex', alignItems: 'center', gap: 0.5, pointerEvents: isHovered || emojiOpen ? 'auto' : 'none' }}>
            <Box ref={emojiPickerRef} sx={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <IconButton
                    size="sm"
                    variant="plain"
                    color="neutral"
                    onClick={(event) => { event.stopPropagation(); setEmojiOpen((value) => !value); }}
                    sx={{ '--IconButton-size': '26px', borderRadius: 'sm', flexShrink: 0, opacity: 0.7, '&:hover': { opacity: 1, backgroundColor: 'background.level1' }, '&:active': { backgroundColor: 'background.level2' } }}
                >
                    <AddReactionOutlinedIcon sx={{ fontSize: '18px' }} />
                </IconButton>
                {emojiOpen && (
                    <Box sx={{ position: 'absolute', [isMe ? 'right' : 'left']: 0, bottom: 'calc(100% + 6px)', display: 'flex', gap: 0.5, backgroundColor: 'background.surface', border: '1px solid', borderColor: 'divider', borderRadius: 'lg', p: 0.75, boxShadow: 'lg', zIndex: 1300, whiteSpace: 'nowrap' }}>
                        {QUICK_EMOJIS.map((emoji) => (
                            <Tooltip key={emoji} title={getQuickEmojiLabel(emoji)} variant="soft">
                                <Box
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        if (msg.id) {
                                            onReact(msg.id, emoji, false);
                                        }
                                        setEmojiOpen(false);
                                    }}
                                    sx={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', cursor: 'pointer', borderRadius: 'md', transition: 'background-color 0.1s ease', '&:hover': { backgroundColor: 'background.level1' } }}
                                >
                                    {emoji}
                                </Box>
                            </Tooltip>
                        ))}
                    </Box>
                )}
            </Box>

            <MessageContextMenu
                msgId={msg.id ?? ''}
                isMe={isMe}
                isFile={isFile}
                fileCompleted={fileCompleted}
                onReply={onReply}
                onEdit={canEdit ? onEdit : undefined}
                onForward={onForward}
                onDelete={onDelete}
                sx={{ position: 'static' }}
            />
        </Box>
    );
};