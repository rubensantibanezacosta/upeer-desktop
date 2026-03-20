import React, { useState, useMemo } from 'react';
import { Box, IconButton, Sheet, Typography, Avatar } from '@mui/joy';
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined';
import { MessageStatus } from './MessageStatus.js';
import { MessageReply } from './MessageReply.js';
import { ContactCard } from '../ContactCard.js';
import { FileMessageItem, FileMessageData } from '../file/FileMessageItem.js';
import { MessageContextMenu } from './MessageContextMenu.js';
import { MessageReactions } from './MessageReactions.js';
import { RichText } from '../../../components/ui/RichText.js';
import { LinkPreviewCard } from './LinkPreviewCard.js';
import type { LinkPreview } from '../../../types/chat.js';

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
        senderAvatar?: string;
    };
    onReply: (msg: any) => void;
    onReact: (msgId: string, emoji: string, remove: boolean) => void;
    onEdit: (msg: any) => void;
    onDelete: (msgId: string) => void;
    originalMessage?: string;
    activeTransfers?: any[];
    onScrollToMessage?: (msgId: string) => void;
    onRetryTransfer?: (fileId: string) => void;
    onCancelTransfer?: (fileId: string) => void;
    onMediaClick?: (media: { url: string; name: string; mimeType: string; fileId: string }) => void;
    originalSenderName?: string;
    isGroup?: boolean;
    isFirstInGroupChain?: boolean;
    isLastInGroupChain?: boolean;
    onTransferStateChange?: (fileId: string, updates: any) => void;
}

/** Parse the raw message string into card/file data */
export function parseMessage(message: string, isMe: boolean, activeTransfers: any[]) {
    let cardData: any = null;
    let fileData: any = null;
    let isJSONFile = false;
    let linkPreviewData: LinkPreview | null = null;
    let textContent: string | null = null;

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
                    (typeof phase === 'number' && (phase === 4 || phase === 5 || phase === 6 || phase === 8)) ||
                    phase === 'verifying' || phase === 'completing' || phase === 'done' || activeTransfer.state === 'completed'
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
                    isVaulting: activeTransfer?.isVaulting,
                    isVoiceNote: parsed.isVoiceNote || activeTransfer?.isVoiceNote,
                    // BUG EC fix: propagar la ruta del archivo para que el botón "Abrir" funcione tras reiniciar.
                    // Priorizamos savedPath del mensaje guardado (persistence fix), luego el estado activo de la transferencia.
                    savedPath: parsed.savedPath || activeTransfer?.savedPath ||
                        (direction === 'sending' ? (parsed.filePath || activeTransfer?.filePath) : (parsed.tempPath || activeTransfer?.tempPath)),
                };
            } else if (parsed.linkPreview && typeof parsed.text === 'string') {
                linkPreviewData = parsed.linkPreview as LinkPreview;
                textContent = parsed.text;
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
                isVaulting: activeTransfer?.isVaulting,
                // BUG EC fix: misma propagación de ruta que el formato JSON
                savedPath: activeTransfer?.savedPath || (transferState === 'completed' ? activeTransfer?.tempPath : undefined),
            };
        }
    }

    return { cardData, fileData, isJSONFile, linkPreviewData, textContent };
}

const QUICK_EMOJIS_CONST = ['👍', '❤️', '😂', '😮', '😢', '👎'];

export const MessageItem: React.FC<MessageItemProps> = React.memo(({
    msg, onReply, onReact, onEdit: _onEdit, onDelete, originalMessage, originalSenderName, activeTransfers = [], onScrollToMessage, onRetryTransfer, onCancelTransfer, onMediaClick, isGroup, isFirstInGroupChain = true, isLastInGroupChain = true, onTransferStateChange
}) => {
    const isMe = msg.isMine;
    const [isHovered, setIsHovered] = useState(false);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const QUICK_EMOJIS = QUICK_EMOJIS_CONST;

    const { cardData, fileData, isJSONFile, linkPreviewData, textContent } = useMemo(() =>
        parseMessage(msg.message, isMe, activeTransfers),
        [msg.message, isMe, activeTransfers]);
    const isContactCard = !!cardData;
    const isFile = isJSONFile || (msg.message.startsWith('FILE_TRANSFER|') && !!fileData);
    const _isMediaFile = isFile && fileData && (
        fileData.mimeType?.startsWith('image/') ||
        fileData.mimeType?.startsWith('video/') ||
        fileData.mimeType?.toLowerCase() === 'video/x-matroska'
    );

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
                mb: msg.reactions && msg.reactions.length > 0 ? 1.2 : 0.2,
            }}
        >
            <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 1, width: '100%', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                {isGroup && !isMe && (
                    isLastInGroupChain ? (
                        <Avatar
                            size="sm"
                            src={msg.senderAvatar}
                            variant="soft"
                            sx={{ mt: 0.5, borderRadius: 'sm', width: 28, height: 28, flexShrink: 0 }}
                        >
                            {msg.senderName ? msg.senderName[0].toUpperCase() : '?'}
                        </Avatar>
                    ) : (
                        <Box sx={{ width: 28, flexShrink: 0 }} />
                    )
                )}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                    {isGroup && !isMe && msg.senderName && isFirstInGroupChain && (
                        <Typography
                            level="body-xs"
                            color="primary"
                            sx={{ fontWeight: 700, ml: 0.5, mb: 0.25, fontSize: '11px', letterSpacing: '0.01em' }}
                        >
                            {msg.senderName}
                        </Typography>
                    )}
                    <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexDirection: isMe ? 'row-reverse' : 'row' }}
                    >
                        <Box sx={{ position: 'relative' }}>
                            <Sheet
                                variant="soft"
                                color={isMe ? 'primary' : 'neutral'}
                                sx={{
                                    p: 0.5,
                                    overflow: 'hidden',
                                    borderRadius: '12px',
                                    borderTopRightRadius: isMe ? '4px' : '12px',
                                    borderTopLeftRadius: isMe ? '12px' : '4px',
                                    maxWidth: isContactCard ? '320px' : '100%',
                                    position: 'relative',
                                    opacity: msg.isDeleted ? 0.6 : 1,
                                    outline: '0px solid transparent',
                                    transition: 'outline 0.2s, outline-offset 0.2s',
                                }}
                            >
                                {!!msg.replyTo && !msg.isDeleted && (
                                    <MessageReply isMe={isMe} originalMessage={originalMessage} originalSenderName={originalSenderName} onClick={scrollToOriginal} />
                                )}

                                {isContactCard && cardData && !msg.isDeleted ? (
                                    <ContactCard name={cardData.name} address={cardData.address} upeerId={cardData.upeerId} isMe={isMe} />
                                ) : isFile && fileData && !msg.isDeleted ? (
                                    <FileMessageItem
                                        data={{ ...fileData, timestamp: msg.timestamp } as any}
                                        isMe={isMe}
                                        status={msg.status}
                                        onRetry={onRetryTransfer}
                                        onCancel={onCancelTransfer}
                                        onDownload={async (fid) => {
                                            const result = await window.upeer.showSaveDialog({
                                                defaultPath: fileData?.fileName,
                                            });
                                            if (!result.canceled && result.filePath) {
                                                const saveResult = await window.upeer.saveTransferredFile(fid, result.filePath);
                                                if (saveResult.success) {
                                                    onTransferStateChange?.(fid, { savedPath: result.filePath });
                                                }
                                            }
                                        }}
                                        onOpen={async (_fid) => {
                                            const sp = fileData?.savedPath;
                                            if (sp) await window.upeer.openFile(sp);
                                        }}
                                        onMediaClick={onMediaClick}
                                    />
                                ) : (
                                    <Box sx={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        columnGap: 1.5,
                                        rowGap: 0,
                                        alignItems: 'flex-end',
                                        minWidth: '80px',
                                        p: 1,
                                        pt: msg.replyTo ? 0.5 : 1,
                                        px: 1.5,
                                        pb: 0.5
                                    }}>
                                        <RichText
                                            isMe={isMe}
                                            level="body-md"
                                            sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontStyle: msg.isDeleted ? 'italic' : 'normal', pb: 0.5 }}
                                        >
                                            {(() => {
                                                if (isFile && fileData && fileData.caption) return fileData.caption;
                                                if (isJSONFile) return '';
                                                if (textContent !== null) return textContent;
                                                return msg.message;
                                            })()}
                                        </RichText>
                                        {linkPreviewData && !msg.isDeleted && (
                                            <Box sx={{ width: '100%', mt: 1 }}>
                                                <LinkPreviewCard data={linkPreviewData} />
                                            </Box>
                                        )}
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto', mb: 0.5 }}>
                                            {msg.isEdited && !msg.isDeleted && (
                                                <Typography level="body-xs" sx={{ fontSize: '9px', opacity: 0.7 }}>(editado)</Typography>
                                            )}
                                            <Typography level="body-xs" sx={{ color: 'inherit', fontSize: '10px', opacity: 0.8 }}>
                                                {msg.timestamp}
                                            </Typography>
                                            {isMe ? <MessageStatus status={msg.status} /> : null}
                                        </Box>
                                    </Box>
                                )}
                            </Sheet>

                            <MessageReactions
                                reactions={msg.reactions || []}
                                isMe={isMe}
                                onRemoveReact={(emoji) => msg.id && onReact(msg.id, emoji, true)}
                            />
                        </Box>

                        {!msg.isDeleted && (
                            <Box sx={{
                                opacity: isHovered || emojiOpen ? 1 : 0,
                                transition: 'opacity 0.1s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                pointerEvents: (isHovered || emojiOpen) ? 'auto' : 'none'
                            }}>
                                {/* Quick Reaction Button */}
                                <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <IconButton
                                        size="sm"
                                        variant="plain"
                                        color="neutral"
                                        onClick={(e) => { e.stopPropagation(); setEmojiOpen(v => !v); }}
                                        sx={{
                                            '--IconButton-size': '26px',
                                            borderRadius: 'sm',
                                            flexShrink: 0,
                                            opacity: 0.7,
                                            '&:hover': {
                                                opacity: 1,
                                                backgroundColor: 'background.level1'
                                            },
                                            '&:active': {
                                                backgroundColor: 'background.level2'
                                            }
                                        }}
                                    >
                                        <AddReactionOutlinedIcon sx={{ fontSize: '18px' }} />
                                    </IconButton>
                                    {emojiOpen && (
                                        <Box sx={{
                                            position: 'absolute',
                                            [isMe ? 'right' : 'left']: 0,
                                            bottom: '100%',
                                            mb: 1,
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
                                                    onClick={() => { if (msg.id) { onReact(msg.id, emoji, false); setEmojiOpen(false); } }}
                                                    sx={{
                                                        width: 32, height: 32,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: '18px',
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

                                <MessageContextMenu
                                    msgId={msg.id ?? ''}
                                    isMe={isMe}
                                    isFile={isFile}
                                    fileCompleted={fileData?.transferState === 'completed'}
                                    onReply={() => onReply(msg)}
                                    onDelete={() => msg.id && onDelete(msg.id)}
                                    sx={{ position: 'static' }}
                                />
                            </Box>
                        )}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
});
