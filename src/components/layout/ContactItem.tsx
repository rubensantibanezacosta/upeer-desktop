import React from 'react';
import {
    Box,
    Typography,
    ListItem,
    ListItemButton,
    ListItemDecorator,
    Avatar,
    Badge
} from '@mui/joy';
import { Contact } from '../../types/chat.js';
import { highlightText } from '../../utils/highlightText.js';
import { ContactItemActions } from './ContactItemActions.js';
import { formatContactTime, getTrustIndicator, renderLastMessagePreview, renderMessageStatusIcon, renderPendingLabel } from './contactItemSupport.js';

interface ContactItemProps {
    contact: Contact;
    isSelected: boolean;
    onSelect: (id: string) => void;
    onToggleFavorite: (id: string) => void;
    onClear: (id: string) => void;
    isTyping: boolean;
    highlight?: string;
}

export const ContactItem: React.FC<ContactItemProps> = ({ contact: c, isSelected, onSelect, onToggleFavorite, onClear, isTyping, highlight = '' }) => {
    const [confirmClearOpen, setConfirmClearOpen] = React.useState(false);
    const isOnline = c.lastSeen && (new Date().getTime() - new Date(c.lastSeen).getTime()) < 65000;
    const isPending = c.status === 'pending' || c.status === 'incoming';

    const timeStr = isPending && c.status === 'incoming' ? formatContactTime(c.lastSeen) : formatContactTime(c.lastMessageTime);
    const hasUnread = !c.lastMessageIsMine && !!c.lastMessage && c.lastMessageStatus !== 'read';
    const isBold = c.status === 'incoming' || hasUnread;

    return (
        <ListItem sx={{ p: 0 }}>
            <ListItemButton
                selected={isSelected}
                onClick={() => onSelect(c.upeerId)}
                sx={{
                    height: '72px',
                    px: 1.5,
                    borderRadius: 0,
                    margin: 0,
                    opacity: isPending ? 0.7 : 1
                }}
            >
                <ListItemDecorator sx={{ mr: 2 }}>
                    <Badge
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        badgeContent={getTrustIndicator(c)}
                        sx={{
                            '--Badge-paddingX': '0px',
                            '--Badge-paddingY': '0px',
                            '--Badge-ring': '2px',
                            '& .MuiBadge-badge': {
                                width: 20,
                                height: 20,
                                borderRadius: 'sm',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: 'background.surface',
                                border: '1px solid',
                                borderColor: 'divider',

                                transform: 'translate(8%, 8%)'
                            }
                        }}
                    >
                        <Avatar
                            size="lg"
                            color={c.status === 'incoming' ? 'primary' : 'neutral'}
                            src={c.avatar || undefined}
                            variant="soft"
                            sx={{ borderRadius: 'md' }}
                        >
                            {c.name[0]}
                        </Avatar>
                    </Badge>
                </ListItemDecorator>
                <Box sx={{
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    justifyContent: 'center',
                    pb: 1,
                    pt: 1,
                    overflow: 'hidden',
                    position: 'relative',
                    '&:hover .chat-options-btn, .chat-options-btn:has(button[aria-expanded="true"])': {
                        display: 'flex'
                    }
                }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Typography level="body-md" sx={{ fontWeight: 500 }} noWrap>
                            {highlight ? highlightText(c.name, highlight) : c.name}
                        </Typography>
                        <Typography level="body-xs" color={isTyping ? "primary" : isBold ? "primary" : "neutral"} sx={{ ml: 1, minWidth: 'max-content', fontWeight: isBold ? 700 : 400 }}>
                            {timeStr}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                        <Typography
                            level="body-sm"
                            component="div"
                            color={isPending ? "neutral" : (isTyping ? "primary" : "neutral")}
                            noWrap
                            sx={{
                                flexGrow: 1,
                                fontStyle: isPending ? 'italic' : 'normal',
                                fontWeight: isBold ? 700 : 400,
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                pr: 4
                            }}
                        >
                            {isPending ? (
                                renderPendingLabel(c)
                            ) : (
                                isTyping ? 'escribiendo...' : (c.lastMessage ? (
                                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, maxWidth: '100%', overflow: 'hidden' }}>
                                        {c.lastMessageIsMine && (
                                            <Box component="span" sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                                {renderMessageStatusIcon(c)}
                                            </Box>
                                        )}
                                        <Typography
                                            level="body-sm"
                                            noWrap
                                            component="span"
                                            sx={{
                                                color: 'inherit',
                                                fontStyle: 'inherit',
                                                display: 'inline-block',
                                                maxWidth: '100%',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                verticalAlign: 'bottom'
                                            }}
                                        >
                                            {renderLastMessagePreview(c, highlight)}
                                        </Typography>
                                    </Box>
                                ) : (isOnline ? 'En línea' : 'Desconectado'))
                            )}
                        </Typography>

                        <ContactItemActions contact={c} confirmClearOpen={confirmClearOpen} setConfirmClearOpen={setConfirmClearOpen} onToggleFavorite={onToggleFavorite} onClear={onClear} />
                    </Box>
                </Box>
            </ListItemButton>
        </ListItem>
    );
};
