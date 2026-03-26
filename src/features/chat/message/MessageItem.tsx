import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Box, Sheet, Typography, Avatar } from '@mui/joy';
import { MessageStatus } from './MessageStatus.js';
import { MessageReply } from './MessageReply.js';
import { ContactCard } from '../ContactCard.js';
import { FileMessageItem } from '../file/FileMessageItem.js';
import { MessageReactions } from './MessageReactions.js';
import { RichText } from '../../../components/ui/RichText.js';
import { LinkPreviewCard } from './LinkPreviewCard.js';
import { MessageItemActions } from './MessageItemActions.js';
import { parseMessage } from './messageItemSupport.js';

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
    onForward?: (msg: any) => void;
    originalMessage?: string;
    activeTransfers?: any[];
    onScrollToMessage?: (msgId: string) => void;
    onRetryMessage?: (msgId: string) => void;
    onRetryTransfer?: (fileId: string) => void;
    onCancelTransfer?: (fileId: string) => void;
    onMediaClick?: (media: { url: string; name: string; mimeType: string; fileId: string }) => void;
    originalSenderName?: string;
    isGroup?: boolean;
    isFirstInGroupChain?: boolean;
    isLastInGroupChain?: boolean;
    onTransferStateChange?: (fileId: string, updates: any) => void;
}

export const MessageItem: React.FC<MessageItemProps> = React.memo(({
    msg, onReply, onReact, onEdit, onDelete, onForward, originalMessage, originalSenderName, activeTransfers = [], onScrollToMessage, onRetryMessage, onRetryTransfer, onCancelTransfer, onMediaClick, isGroup, isFirstInGroupChain = true, isLastInGroupChain = true, onTransferStateChange
}) => {
    const isMe = msg.isMine;
    const [isHovered, setIsHovered] = useState(false);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const emojiPickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!emojiOpen) return;
        const handle = (e: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
                setEmojiOpen(false);
            }
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, [emojiOpen]);

    const { cardData, fileData, isJSONFile, linkPreviewData, textContent } = useMemo(() =>
        parseMessage(msg.message, isMe, activeTransfers),
        [msg.message, isMe, activeTransfers]);
    const isContactCard = !!cardData;
    const isFile = isJSONFile || (msg.message.startsWith('FILE_TRANSFER|') && !!fileData);
    const canEdit = isMe && !msg.isDeleted && !isContactCard &&
        (!isFile || (!!fileData?.caption && fileData.transferState === 'completed'));
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

    const bubbleText = (() => {
        if (isFile && fileData?.caption) return fileData.caption;
        if (textContent !== null) return textContent;
        if (isJSONFile || isContactCard) return '';
        return msg.message;
    })();

    return (
        <Box
            id={`msg-${msg.id}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            sx={{
                alignSelf: 'stretch',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
                mb: msg.reactions && msg.reactions.length > 0 ? 2.5 : 0.2,
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
                                    p: 0,
                                    overflow: 'hidden',
                                    borderRadius: '12px',
                                    borderTopRightRadius: isMe ? '4px' : '12px',
                                    borderTopLeftRadius: isMe ? '12px' : '4px',
                                    maxWidth: isContactCard ? '360px' : '100%',
                                    position: 'relative',
                                    opacity: msg.isDeleted ? 0.6 : 1,
                                    outline: '0px solid transparent',
                                    transition: 'outline 0.2s, outline-offset 0.2s',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.2)',
                                }}
                            >
                                {!!msg.replyTo && !msg.isDeleted && (
                                    <Box sx={{ p: 0.5, pb: 0 }}>
                                        <MessageReply isMe={isMe} originalMessage={originalMessage} originalSenderName={originalSenderName} onClick={scrollToOriginal} />
                                    </Box>
                                )}

                                {isFile && fileData && !msg.isDeleted ? (
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
                                        columnGap: 1,
                                        rowGap: 0,
                                        alignItems: 'flex-end',
                                        minWidth: '80px',
                                        p: 0.5,
                                        pt: msg.replyTo ? 0 : 0.5,
                                        px: 1,
                                        pb: 0.25
                                    }}>
                                        {bubbleText ? (
                                            <RichText
                                                isMe={isMe}
                                                level="body-md"
                                                sx={{
                                                    wordBreak: 'break-word',
                                                    whiteSpace: 'pre-wrap',
                                                    fontStyle: msg.isDeleted ? 'italic' : 'normal',
                                                    pb: (linkPreviewData || cardData) ? 0 : 0.5,
                                                    transform: msg.isDeleted ? 'translateY(2px)' : 'none'
                                                }}
                                            >
                                                {bubbleText}
                                            </RichText>
                                        ) : null}
                                        {cardData && !msg.isDeleted && (
                                            <Box sx={{ width: '100%', mt: bubbleText ? 1 : 0.5 }}>
                                                <ContactCard
                                                    name={cardData.name}
                                                    address={cardData.address}
                                                    upeerId={cardData.upeerId}
                                                    avatar={cardData.avatar}
                                                    isMe={isMe}
                                                />
                                            </Box>
                                        )}
                                        {linkPreviewData && !msg.isDeleted && (
                                            <Box sx={{ width: '100%', mt: 1 }}>
                                                <LinkPreviewCard data={linkPreviewData} />
                                            </Box>
                                        )}
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
                                            {msg.isEdited && !msg.isDeleted && (
                                                <Typography level="body-xs" sx={{ fontSize: '9px', opacity: 0.7 }}>(Editado)</Typography>
                                            )}
                                            <Typography level="body-xs" sx={{ color: 'inherit', fontSize: '10px', opacity: 0.8 }}>
                                                {msg.timestamp}
                                            </Typography>
                                            {isMe ? <MessageStatus status={msg.status} onRetry={msg.id && msg.status === 'failed' ? () => onRetryMessage?.(msg.id!) : undefined} /> : null}
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

                        <MessageItemActions
                            msg={msg}
                            isHovered={isHovered}
                            emojiOpen={emojiOpen}
                            setEmojiOpen={setEmojiOpen}
                            emojiPickerRef={emojiPickerRef}
                            isMe={isMe}
                            isFile={isFile}
                            fileCompleted={fileData?.transferState === 'completed'}
                            canEdit={canEdit}
                            onReact={onReact}
                            onReply={() => onReply(msg)}
                            onEdit={onEdit ? () => onEdit(msg) : undefined}
                            onForward={!msg.isDeleted && onForward ? () => onForward(msg) : undefined}
                            onDelete={() => msg.id && onDelete(msg.id)}
                        />
                    </Box>
                </Box>
            </Box>
        </Box>
    );
});
