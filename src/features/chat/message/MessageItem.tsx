import React, { useState } from 'react';
import { Box, IconButton, Sheet, Typography } from '@mui/joy';
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined';
import { MessageStatus } from './MessageStatus.js';
import { MessageReply } from './MessageReply.js';
import { ContactCard } from '../ContactCard.js';
import { FileMessageItem, FileMessageData } from '../file/FileMessageItem.js';
import { MessageContextMenu } from './MessageContextMenu.js';
import { MessageReactions } from './MessageReactions.js';

interface MessageItemProps {
    msg: {
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
    };
    onReply: (msg: any) => void;
    onReact: (msgId: string, emoji: string, remove: boolean) => void;
    onEdit: (msg: any) => void;
    onDelete: (msgId: string) => void;
    originalMessage?: string;
    activeTransfers?: any[];
    onScrollToMessage?: (msgId: string) => void;
    isGroup?: boolean;
}

/** Parse the raw message string into card/file data */
function parseMessage(message: string, isMe: boolean, activeTransfers: any[]) {
    let cardData: any = null;
    let fileData: any = null;
    let isJSONFile = false;

    if (message.startsWith('CONTACT_CARD|')) {
        const parts = message.split('|');
        cardData = { name: parts[1], address: parts[2], upeerId: parts[3], publicKey: parts[4] };
    }

    if (message.startsWith('{') && message.endsWith('}')) {
        try {
            const parsed = JSON.parse(message);
            if (parsed.type === 'file') {
                isJSONFile = true;
                const direction = parsed.direction || (isMe ? 'sending' : 'receiving');
                const activeTransfer = activeTransfers.find(t =>
                    (t.fileId === parsed.transferId || t.fileId === parsed.fileId) && t.direction === direction
                );
                const phase = activeTransfer?.phase;
                const isFinished = activeTransfer ? (
                    (typeof phase === 'number' && phase >= 5) ||
                    phase === 'completing' || phase === 'done' || activeTransfer.state === 'completed'
                ) : false;
                const transferState = activeTransfer ? (isFinished ? 'completed' : activeTransfer.state) : (parsed.state || 'completed');
                fileData = {
                    fileId: parsed.transferId || parsed.fileId,
                    fileName: parsed.fileName, fileSize: parsed.fileSize,
                    mimeType: parsed.mimeType, fileHash: parsed.fileHash,
                    thumbnail: parsed.thumbnail, caption: parsed.caption,
                    transferState,
                    progress: activeTransfer ? (transferState === 'completed' ? 100 : activeTransfer.progress) : (parsed.state === 'completed' || !parsed.state ? 100 : 0),
                    direction,
                    // BUG EC fix: propagar la ruta del archivo recibido para que
                    // el botón "Abrir" funcione (usa tempPath hasta que el usuario
                    // guarde en una ubicación definitiva).
                    savedPath: activeTransfer?.savedPath || (transferState === 'completed' ? activeTransfer?.tempPath : undefined),
                };
            }
        } catch (_) { /* not a file */ }
    }

    if (!fileData && message.startsWith('FILE_TRANSFER|')) {
        const parts = message.split('|');
        if (parts.length >= 6) {
            const direction = isMe ? 'sending' as const : 'receiving' as const;
            let transferState: FileMessageData['transferState'] = 'completed';
            let progress = 100;
            const activeTransfer = activeTransfers.find(t => t.fileId === parts[1] && t.direction === direction);
            if (activeTransfer) {
                transferState = activeTransfer.state;
                progress = activeTransfer.progress || 0;
            } else if (message.includes('|failed')) {
                transferState = 'failed';
            } else if (message.includes('|cancelled')) {
                transferState = 'cancelled';
            }
            fileData = {
                fileId: parts[1], fileName: parts[2],
                fileSize: parseInt(parts[3], 10), mimeType: parts[4],
                fileHash: parts[5],
                thumbnail: parts[6] && parts[6] !== 'undefined' ? parts[6] : undefined,
                transferState, progress, direction,
                // BUG EC fix: misma propagación de ruta que el formato JSON
                savedPath: activeTransfer?.savedPath || (transferState === 'completed' ? activeTransfer?.tempPath : undefined),
            };
        }
    }

    return { cardData, fileData, isJSONFile };
}

export const MessageItem: React.FC<MessageItemProps> = ({
    msg, onReply, onReact, onEdit, onDelete, originalMessage, activeTransfers = [], onScrollToMessage, isGroup
}) => {
    const isMe = msg.isMine;
    const [isHovered, setIsHovered] = useState(false);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👎'];

    const { cardData, fileData, isJSONFile } = parseMessage(msg.message, isMe, activeTransfers);
    const isContactCard = !!cardData;
    const isFile = isJSONFile || (msg.message.startsWith('FILE_TRANSFER|') && !!fileData);
    const isMediaFile = isFile && fileData && (fileData.mimeType?.startsWith('image/') || fileData.mimeType?.startsWith('video/'));

    const scrollToOriginal = () => {
        if (msg.replyTo && onScrollToMessage) {
            onScrollToMessage(msg.replyTo);
        } else if (msg.replyTo) {
            document.getElementById(`msg-${msg.replyTo}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    return (
        <Box
            id={`msg-${msg.id}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setEmojiOpen(false); }}
            sx={{
                alignSelf: 'stretch',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
                mb: msg.reactions && msg.reactions.length > 0 ? 1.5 : 0.5,
            }}
        >
            {/* Sender name for group messages */}
            {isGroup && !isMe && msg.senderName && (
                <Typography
                    level="body-xs"
                    color="primary"
                    sx={{ fontWeight: 700, ml: 1, mb: 0.25, fontSize: '11px', letterSpacing: '0.01em' }}
                >
                    {msg.senderName}
                </Typography>
            )}
            <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexDirection: isMe ? 'row-reverse' : 'row', maxWidth: '80%' }}
            >
                <Box sx={{ position: 'relative' }}>
                    <Sheet
                        variant="soft"
                        color={isMe ? 'primary' : 'neutral'}
                        sx={{
                            p: (isMediaFile && !msg.isDeleted) ? 0 : 1,
                            px: (isMediaFile && !msg.isDeleted) ? 0 : 1.5,
                            pb: (isMediaFile && !msg.isDeleted) ? 0 : 0.5,
                            overflow: 'hidden',
                            borderRadius: '12px',
                            borderTopRightRadius: isMe ? '4px' : '12px',
                            borderTopLeftRadius: isMe ? '12px' : '4px',
                            maxWidth: isContactCard ? '320px' : '100%',
                            boxShadow: 'sm',
                            position: 'relative',
                            opacity: msg.isDeleted ? 0.6 : 1,
                        }}
                    >
                        {!!msg.replyTo && !msg.isDeleted && (
                            <MessageReply isMe={isMe} originalMessage={originalMessage} onClick={scrollToOriginal} />
                        )}

                        {isContactCard && cardData && !msg.isDeleted ? (
                            <ContactCard name={cardData.name} address={cardData.address} upeerId={cardData.upeerId} isMe={isMe} />
                        ) : isFile && fileData && !msg.isDeleted ? (
                            <FileMessageItem
                                data={{ ...fileData, timestamp: msg.timestamp } as any}
                                isMe={isMe}
                                status={msg.status}
                                onDownload={async (fid) => {
                                    // BUG EC fix: mostrar diálogo nativo "Guardar como" y
                                    // mover el archivo desde el temp del gestor de transferencias
                                    // al destino elegido por el usuario.
                                    const result = await window.upeer.showSaveDialog({
                                        defaultPath: fileData?.fileName,
                                    });
                                    if (!result.canceled && result.filePath) {
                                        await window.upeer.saveTransferredFile(fid, result.filePath);
                                    }
                                }}
                                onOpen={async (_fid) => {
                                    // BUG EC fix: abrir el archivo (tempPath o savedPath)
                                    // con la aplicación predeterminada del sistema.
                                    const sp = fileData?.savedPath;
                                    if (sp) await window.upeer.openFile(sp);
                                }}
                            />
                        ) : (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0, alignItems: 'flex-end', minWidth: '80px' }}>
                                <Typography
                                    level="body-md"
                                    sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontStyle: msg.isDeleted ? 'italic' : 'normal', pb: 0.5 }}
                                >
                                    {msg.message}
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto', mb: 0.5 }}>
                                    {msg.isEdited && !msg.isDeleted && (
                                        <Typography level="body-xs" sx={{ fontSize: '9px', opacity: 0.7 }}>(editado)</Typography>
                                    )}
                                    <Typography level="body-xs" sx={{ color: 'inherit', fontSize: '10px', opacity: 0.8 }}>
                                        {msg.timestamp}
                                    </Typography>
                                    {isMe && <MessageStatus status={msg.status} />}
                                </Box>
                            </Box>
                        )}

                        {!msg.isDeleted && isHovered && (
                            <MessageContextMenu
                                msgId={msg.id!}
                                isMe={isMe}
                                isFile={isFile}
                                fileCompleted={fileData?.transferState === 'completed'}
                                onReply={() => onReply(msg)}
                                onReact={(emoji) => onReact(msg.id!, emoji, false)}
                                onDelete={() => onDelete(msg.id!)}
                            />
                        )}
                    </Sheet>
                    <MessageReactions
                        reactions={msg.reactions || []}
                        isMe={isMe}
                        onRemoveReact={(emoji) => onReact(msg.id!, emoji, true)}

                    />
                </Box>

                {/* Botón flotante de reacción */}
                {!msg.isDeleted && (isHovered || emojiOpen) && (
                    <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', alignSelf: 'flex-end', mb: '4px' }}>
                        <IconButton
                            size="sm"
                            variant="outlined"
                            color="neutral"
                            onClick={(e) => { e.stopPropagation(); setEmojiOpen(v => !v); }}
                            sx={{ '--IconButton-size': '28px', borderRadius: '50%', flexShrink: 0 }}

                        >
                            <AddReactionOutlinedIcon sx={{ fontSize: '16px' }} />
                        </IconButton>
                        {emojiOpen && (
                            <Box sx={{
                                position: 'absolute',
                                [isMe ? 'right' : 'left']: 0,
                                bottom: '110%',
                                display: 'flex',
                                gap: 0.5,
                                backgroundColor: 'background.surface',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 'lg',
                                p: 0.75,
                                boxShadow: 'lg',
                                zIndex: 1200,
                                whiteSpace: 'nowrap',
                            }}>
                                {QUICK_EMOJIS.map(emoji => (
                                    <Box
                                        key={emoji}
                                        onClick={() => { onReact(msg.id!, emoji, false); setEmojiOpen(false); }}
                                        sx={{
                                            width: 34, height: 34,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '20px',
                                            cursor: 'pointer',
                                            borderRadius: 'md',
                                            transition: 'background-color 0.1s ease, transform 0.1s ease',
                                            '&:hover': { backgroundColor: 'background.level1', transform: 'scale(1.15)' },
                                        }}
                                    >
                                        {emoji}
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Box>
                )}
            </Box>
        </Box>
    );
};
