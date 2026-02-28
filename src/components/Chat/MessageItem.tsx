import React from 'react';
import { Box, Sheet, IconButton, Typography } from '@mui/joy';
import ReplyIcon from '@mui/icons-material/Reply';
import { MessageStatus } from './MessageStatus.js';
import { MessageReply } from './MessageReply.js';
import { ContactCard } from './ContactCard.js';

interface MessageItemProps {
    msg: {
        id?: string;
        revelnestId: string;
        isMine: boolean;
        message: string;
        status: string;
        timestamp: string;
        replyTo?: string;
    };
    onReply: (msg: any) => void;
    originalMessage?: string;
}

export const MessageItem: React.FC<MessageItemProps> = ({ msg, onReply, originalMessage }) => {
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
                '&:hover .reply-button': { opacity: 1 },
                mb: 0.5
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexDirection: isMe ? 'row-reverse' : 'row' }}>
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
                        position: 'relative'
                    }}
                >
                    {isReply && (
                        <MessageReply
                            isMe={isMe}
                            originalMessage={originalMessage}
                            onClick={scrollToOriginal}
                        />
                    )}

                    {isContactCard && cardData ? (
                        <ContactCard
                            name={cardData.name}
                            address={cardData.address}
                            revelnestId={cardData.revelnestId}
                            isMe={isMe}
                        />
                    ) : (
                        <Typography level="body-md" sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                            {msg.message}
                        </Typography>
                    )}
                </Sheet>

                <IconButton
                    className="reply-button"
                    size="sm"
                    variant="plain"
                    color="neutral"
                    sx={{ opacity: 0, transition: 'opacity 0.2s', minWidth: '32px', minHeight: '32px' }}
                    onClick={() => onReply(msg)}
                >
                    <ReplyIcon sx={{ fontSize: '18px' }} />
                </IconButton>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.25, gap: 0.5, px: 0.5 }}>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', fontSize: '10px', textTransform: 'uppercase', fontWeight: 500 }}>
                    {msg.timestamp}
                </Typography>
                {isMe && <MessageStatus status={msg.status} />}
            </Box>
        </Box>
    );
};
