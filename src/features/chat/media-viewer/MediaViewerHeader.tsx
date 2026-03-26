import React from 'react';
import { Avatar, Box, IconButton, Tooltip, Typography } from '@mui/joy';
import CloseIcon from '@mui/icons-material/Close';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import ReplyIcon from '@mui/icons-material/Reply';
import ShortcutOutlinedIcon from '@mui/icons-material/ShortcutOutlined';
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { QUICK_EMOJIS, type MediaItem } from './mediaViewerSupport.js';

interface MediaViewerHeaderProps {
    currentItem: MediaItem;
    emojiOpen: boolean;
    setEmojiOpen: React.Dispatch<React.SetStateAction<boolean>>;
    emojiMenuRef: React.RefObject<HTMLDivElement | null>;
    onClose: () => void;
    onDownload: (item: MediaItem) => void;
    onReply?: (item: MediaItem) => void;
    onForward?: (item: MediaItem) => void;
    onReact?: (item: MediaItem, emoji: string) => void;
    onGoToMessage?: (item: MediaItem) => void;
}

export const MediaViewerHeader: React.FC<MediaViewerHeaderProps> = ({
    currentItem,
    emojiOpen,
    setEmojiOpen,
    emojiMenuRef,
    onClose,
    onDownload,
    onReply,
    onForward,
    onReact,
    onGoToMessage,
}) => (
    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)', zIndex: 30, pointerEvents: 'none' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pointerEvents: 'auto' }}>
            <Avatar src={currentItem.senderAvatar} size="sm" sx={{ borderRadius: 'md', border: '1px solid rgba(255,255,255,0.2)' }}>
                {currentItem.senderName?.charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <Typography level="body-sm" sx={{ color: 'white', fontWeight: 'bold', lineHeight: 1.2 }}>
                    {currentItem.senderName || 'Desconocido'}
                </Typography>
                <Typography level="body-xs" sx={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.2 }}>
                    {currentItem.timestamp ? `Hoy a las ${currentItem.timestamp}` : currentItem.fileName}
                </Typography>
            </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, pointerEvents: 'auto' }} onClick={(event) => event.stopPropagation()}>
            <Tooltip title="Responder" variant="soft" sx={{ zIndex: 3000 }}>
                <IconButton variant="plain" color="neutral" onClick={() => onReply?.(currentItem)} sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                    <ReplyIcon />
                </IconButton>
            </Tooltip>
            <Tooltip title="Reenviar" variant="soft" sx={{ zIndex: 3000 }}>
                <IconButton variant="plain" color="neutral" onClick={() => onForward?.(currentItem)} sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                    <ShortcutOutlinedIcon />
                </IconButton>
            </Tooltip>
            <Box sx={{ position: 'relative' }}>
                <Tooltip title="Reaccionar" variant="soft" sx={{ zIndex: 3000 }} open={emojiOpen ? false : undefined}>
                    <IconButton variant="plain" color="neutral" onClick={(event) => { event.stopPropagation(); setEmojiOpen((value) => !value); }} sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                        <AddReactionOutlinedIcon />
                    </IconButton>
                </Tooltip>

                {emojiOpen && (
                    <Box ref={emojiMenuRef} sx={{ position: 'absolute', right: 0, top: '100%', mt: 1, display: 'flex', gap: 0.5, backgroundColor: 'background.surface', border: '1px solid', borderColor: 'divider', borderRadius: 'lg', p: 0.75, boxShadow: 'lg', zIndex: 3100, whiteSpace: 'nowrap' }}>
                        {QUICK_EMOJIS.map((emoji) => (
                            <Box
                                key={emoji}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onReact?.(currentItem, emoji);
                                    setEmojiOpen(false);
                                    setTimeout(() => onGoToMessage?.(currentItem), 100);
                                }}
                                sx={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', cursor: 'pointer', borderRadius: 'md', transition: 'background-color 0.1s ease, transform 0.1s ease', '&:hover': { backgroundColor: 'background.level1', transform: 'scale(1.15)' } }}
                            >
                                {emoji}
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>
            <Tooltip title="Ir al mensaje" variant="soft" sx={{ zIndex: 3000 }}>
                <IconButton variant="plain" color="neutral" onClick={() => onGoToMessage?.(currentItem)} sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                    <OpenInNewIcon />
                </IconButton>
            </Tooltip>
            <Tooltip title="Descargar" variant="soft" sx={{ zIndex: 3000 }}>
                <IconButton variant="plain" color="neutral" onClick={() => onDownload(currentItem)} sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                    <DownloadOutlinedIcon />
                </IconButton>
            </Tooltip>
            <Tooltip title="Cerrar" variant="soft" sx={{ zIndex: 3000 }}>
                <IconButton variant="plain" color="neutral" onClick={onClose} sx={{ color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                    <CloseIcon />
                </IconButton>
            </Tooltip>
        </Box>
    </Box>
);