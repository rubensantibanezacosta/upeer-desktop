import React from 'react';
import { Box, Sheet, IconButton, Typography } from '@mui/joy';
import ReplyIcon from '@mui/icons-material/Reply';
import { MessageStatus } from './MessageStatus.js';
import { MessageReply } from './MessageReply.js';
import { ContactCard } from './ContactCard.js';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddReactionIcon from '@mui/icons-material/AddReaction';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { Menu, MenuItem, Dropdown, MenuButton } from '@mui/joy';

interface MessageItemProps {
    msg: {
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
    };
    onReply: (msg: any) => void;
    onReact: (msgId: string, emoji: string, remove: boolean) => void;
    onEdit: (msg: any) => void;
    onDelete: (msgId: string) => void;
    originalMessage?: string;
}

export const MessageItem: React.FC<MessageItemProps> = ({ msg, onReply, onReact, onEdit, onDelete, originalMessage }) => {
    const isMe = msg.isMine;
    const isReply = !!msg.replyTo;
    const isContactCard = msg.message.startsWith('CONTACT_CARD|');

    let cardData = null;
    if (isContactCard) {
        const parts = msg.message.split('|');
        cardData = {
            name: parts[1],
            address: parts[2],
            revelnestId: parts[3],
            publicKey: parts[4]
        };
    }

    const scrollToOriginal = () => {
        if (msg.replyTo) {
            const el = document.getElementById(`msg-${msg.replyTo}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    return (
        <Box
            id={`msg-${msg.id}`}
            sx={{
                alignSelf: isMe ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
                '&:hover .message-actions': { opacity: 1 },
                mb: 0.5
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                <Sheet
                    variant="solid"
                    color={isMe ? "primary" : "neutral"}
                    invertedColors={isMe}
                    sx={{
                        p: 1.25,
                        px: 2,
                        borderRadius: '18px',
                        borderTopRightRadius: isMe ? '4px' : '18px',
                        borderTopLeftRadius: isMe ? '18px' : '4px',
                        maxWidth: isContactCard ? '320px' : '100%',
                        boxShadow: 'sm',
                        position: 'relative',
                        opacity: msg.isDeleted ? 0.6 : 1
                    }}
                >
                    {isReply && !msg.isDeleted && (
                        <MessageReply
                            isMe={isMe}
                            originalMessage={originalMessage}
                            onClick={scrollToOriginal}
                        />
                    )}

                    {isContactCard && cardData && !msg.isDeleted ? (
                        <ContactCard
                            name={cardData.name}
                            address={cardData.address}
                            revelnestId={cardData.revelnestId}
                            isMe={isMe}
                        />
                    ) : (
                        <Box>
                            <Typography level="body-md" sx={{
                                wordBreak: 'break-word',
                                whiteSpace: 'pre-wrap',
                                fontStyle: msg.isDeleted ? 'italic' : 'normal'
                            }}>
                                {msg.message}
                            </Typography>
                            {msg.isEdited && !msg.isDeleted && (
                                <Typography level="body-xs" sx={{ mt: 0.5, fontSize: '9px', opacity: 0.7, textAlign: 'right' }}>
                                    (editado)
                                </Typography>
                            )}
                        </Box>
                    )}

                    {/* Reactions Display */}
                    {msg.reactions && msg.reactions.length > 0 && (
                        <Box sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 0.5,
                            mt: 0.5,
                            position: 'absolute',
                            bottom: -15,
                            [isMe ? 'right' : 'left']: 10,
                            zIndex: 1
                        }}>
                            {Object.entries(
                                msg.reactions.reduce((acc: any, r) => {
                                    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                    return acc;
                                }, {})
                            ).map(([emoji, count]) => (
                                <Sheet
                                    key={emoji}
                                    variant="outlined"
                                    color="neutral"
                                    sx={{
                                        px: 0.5,
                                        py: 0.1,
                                        borderRadius: '10px',
                                        fontSize: '11px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.3,
                                        backgroundColor: 'background.surface',
                                        cursor: 'pointer',
                                        '&:hover': { borderColor: 'primary.outlinedBorder' }
                                    }}
                                    onClick={() => onReact(msg.id!, emoji, true)}
                                >
                                    {emoji} {count as number > 1 ? count as number : ''}
                                </Sheet>
                            ))}
                        </Box>
                    )}
                </Sheet>

                <Box className="message-actions" sx={{
                    display: 'flex',
                    opacity: 0,
                    transition: 'opacity 0.2s',
                    flexDirection: isMe ? 'row-reverse' : 'row',
                    alignItems: 'center'
                }}>
                    <IconButton size="sm" variant="plain" color="neutral" sx={{ minWidth: 32 }} onClick={() => onReply(msg)}>
                        <ReplyIcon sx={{ fontSize: '18px' }} />
                    </IconButton>

                    {!msg.isDeleted && (
                        <Dropdown>
                            <MenuButton slots={{ root: IconButton }} slotProps={{ root: { size: 'sm', variant: 'plain', color: 'neutral', sx: { minWidth: 28 } } }}>
                                <AddReactionIcon sx={{ fontSize: '18px' }} />
                            </MenuButton>
                            <Menu size="sm" variant="outlined" sx={{ minWidth: 120, p: 0.5, display: 'flex', flexDirection: 'row', gap: 0.5 }}>
                                {['👍', '❤️', '😂', '😮', '😢', '🔥'].map(emoji => (
                                    <IconButton
                                        key={emoji}
                                        size="sm"
                                        variant="plain"
                                        onClick={() => onReact(msg.id!, emoji, false)}
                                    >
                                        {emoji}
                                    </IconButton>
                                ))}
                            </Menu>
                        </Dropdown>
                    )}

                    {!msg.isDeleted && isMe && (
                        <Dropdown>
                            <MenuButton slots={{ root: IconButton }} slotProps={{ root: { size: 'sm', variant: 'plain', color: 'neutral', sx: { minWidth: 28 } } }}>
                                <MoreHorizIcon sx={{ fontSize: '18px' }} />
                            </MenuButton>
                            <Menu size="sm" variant="outlined" sx={{ minWidth: 120 }}>
                                <MenuItem onClick={() => onEdit(msg)}>
                                    <EditIcon sx={{ fontSize: '18px', mr: 1 }} /> Editar
                                </MenuItem>
                                <MenuItem color="danger" onClick={() => onDelete(msg.id!)}>
                                    <DeleteIcon sx={{ fontSize: '18px', mr: 1 }} /> Eliminar
                                </MenuItem>
                            </Menu>
                        </Dropdown>
                    )}
                </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.25, gap: 0.5, px: 0.5, pt: msg.reactions?.length ? 1 : 0 }}>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '10px', textTransform: 'uppercase', fontWeight: 500 }}>
                    {msg.timestamp}
                </Typography>
                {isMe && <MessageStatus status={msg.status} />}
            </Box>
        </Box>
    );
};
