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
import { FileMessageItem, FileMessageData } from './FileMessageItem.js';

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
    activeTransfers?: any[];
    onScrollToMessage?: (msgId: string) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({ msg, onReply, onReact, onEdit, onDelete, originalMessage, activeTransfers = [], onScrollToMessage }) => {
    const isMe = msg.isMine;
    const isReply = !!msg.replyTo;
    const isContactCard = msg.message.startsWith('CONTACT_CARD|');
    const isFileTransfer = msg.message.startsWith('FILE_TRANSFER|');

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

    let fileData = null;
    let isJSONFile = false;

    // Try to parse as JSON if it looks like one
    if (msg.message.startsWith('{') && msg.message.endsWith('}')) {
        try {
            const parsed = JSON.parse(msg.message);
            if (parsed.type === 'file') {
                isJSONFile = true;
                const direction = parsed.direction || (isMe ? 'sending' : 'receiving');
                const activeTransfer = activeTransfers.find(t =>
                    (t.fileId === parsed.transferId || t.fileId === parsed.fileId) &&
                    t.direction === direction
                );

                const phase = activeTransfer?.phase;
                const isFinished = activeTransfer ? (
                    (typeof phase === 'number' && phase >= 5) ||
                    phase === 'completing' || phase === 'done' ||
                    activeTransfer.state === 'completed'
                ) : false;

                const transferState = activeTransfer ? (isFinished ? 'completed' : activeTransfer.state)
                    : (parsed.state || 'completed');

                fileData = {
                    fileId: parsed.transferId || parsed.fileId,
                    fileName: parsed.fileName,
                    fileSize: parsed.fileSize,
                    mimeType: parsed.mimeType,
                    fileHash: parsed.fileHash,
                    thumbnail: parsed.thumbnail,
                    caption: parsed.caption,
                    transferState: transferState,
                    progress: activeTransfer ? (transferState === 'completed' ? 100 : activeTransfer.progress) : (parsed.state === 'completed' || !parsed.state ? 100 : 0),
                    direction: direction,
                    timestamp: msg.timestamp
                };
            }
        } catch (e) {
            // Not a valid JSON or not a file message
        }
    }

    if (!fileData && isFileTransfer && !msg.isDeleted) {
        const parts = msg.message.split('|');
        if (parts.length >= 6) {
            const direction = isMe ? 'sending' as const : 'receiving' as const;
            let transferState: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled' = 'completed';
            let progress = 100;

            const activeTransfer = activeTransfers.find(t =>
                t.fileId === parts[1] && t.direction === direction
            );

            if (activeTransfer) {
                transferState = activeTransfer.state as 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';
                progress = activeTransfer.progress || 0;
            } else if (msg.message.includes('|failed')) {
                // Future-proofing if saved in string
                transferState = 'failed';
            } else if (msg.message.includes('|cancelled')) {
                transferState = 'cancelled';
            }

            fileData = {
                fileId: parts[1],
                fileName: parts[2],
                fileSize: parseInt(parts[3], 10),
                mimeType: parts[4],
                fileHash: parts[5],
                thumbnail: parts[6] && parts[6] !== 'undefined' ? parts[6] : undefined, // Check for 'undefined' string occasionally
                transferState,
                progress,
                direction,
                timestamp: msg.timestamp
            };
        }
    }

    const isFile = isJSONFile || (isFileTransfer && !!fileData);

    const scrollToOriginal = () => {
        if (msg.replyTo && onScrollToMessage) {
            onScrollToMessage(msg.replyTo);
        } else if (msg.replyTo) {
            // Fallback for non-virtualized (though not likely now)
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
                        p: 1,
                        px: 1.5,
                        pb: 0.5,
                        borderRadius: '12px',
                        borderTopRightRadius: isMe ? '4px' : '12px',
                        borderTopLeftRadius: isMe ? '12px' : '4px',
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
                    ) : isFile && fileData && !msg.isDeleted ? (
                        <FileMessageItem
                            data={fileData as any}
                            isMe={isMe}
                            status={msg.status}
                            onDownload={(fileId) => {
                                console.log('Download file:', fileId);
                                // TODO: Implement download logic
                            }}
                            onOpen={(fileId) => {
                                console.log('Open file:', fileId);
                                // TODO: Implement open logic
                            }}
                        />
                    ) : (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0, alignItems: 'flex-end', minWidth: '80px' }}>
                            <Typography level="body-md" sx={{
                                wordBreak: 'break-word',
                                whiteSpace: 'pre-wrap',
                                fontStyle: msg.isDeleted ? 'italic' : 'normal',
                                pb: 0.5
                            }}>
                                {msg.message}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto', mb: 0.5 }}>
                                {msg.isEdited && !msg.isDeleted && (
                                    <Typography level="body-xs" sx={{ fontSize: '9px', opacity: 0.7 }}>
                                        (editado)
                                    </Typography>
                                )}
                                <Typography level="body-xs" sx={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'text.tertiary', fontSize: '10px', opacity: 0.8 }}>
                                    {msg.timestamp}
                                </Typography>
                                {isMe && <MessageStatus status={msg.status} />}
                            </Box>
                        </Box>
                    )}

                    {/* Reactions Display */}
                    {msg.reactions && msg.reactions.length > 0 && (
                        <Box sx={{
                            display: 'flex',
                            flexWrap: 'nowrap',
                            width: 'max-content',
                            gap: 0,
                            position: 'absolute',
                            bottom: -18,
                            [isMe ? 'right' : 'left']: 8,
                            zIndex: 2,
                            backgroundColor: 'neutral.solidBg',
                            borderRadius: '16px',
                            border: '2px solid',
                            borderColor: 'background.body',
                            overflow: 'hidden'
                        }}>
                            {Object.entries(
                                msg.reactions.reduce((acc: any, r) => {
                                    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                    return acc;
                                }, {})
                            ).map(([emoji, count]) => (
                                <Box
                                    key={emoji}
                                    sx={{
                                        px: 0.75,
                                        height: '22px',
                                        minWidth: '22px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 0.5,
                                        cursor: 'pointer',
                                        color: 'neutral.solidColor',
                                        fontWeight: 600,
                                        fontSize: '11px',
                                    }}
                                    onClick={() => onReact(msg.id!, emoji, true)}
                                >
                                    <span style={{ fontSize: '14px', lineHeight: 1 }}>{emoji}</span>
                                    {(count as number) > 1 && <span>{count as number}</span>}
                                </Box>
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
                                    <MenuItem
                                        key={emoji}
                                        onClick={() => onReact(msg.id!, emoji, false)}
                                        sx={{ borderRadius: 'sm', p: 1, minHeight: 'unset', justifyContent: 'center' }}
                                    >
                                        {emoji}
                                    </MenuItem>
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

            {msg.reactions && msg.reactions.length > 0 && (
                <Box sx={{ height: 10 }} />
            )}
        </Box>
    );
};
