import React from 'react';
import { Box, ListItemButton, ListItemContent, ListItemDecorator, Sheet, Typography } from '@mui/joy';
import PermMediaOutlinedIcon from '@mui/icons-material/PermMediaOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { getFileIcon } from '../../utils/fileIcons.js';
import { isVideoMediaFile } from './contactInfoHelpers.js';

export interface SharedMediaItem {
    fileId: string;
    fileName: string;
    mimeType: string;
    url: string;
    preview: string;
}

interface ContactMediaStripProps {
    items: SharedMediaItem[];
    onOpenMedia: (media: { url: string; name: string; mimeType: string; fileId: string }) => void;
    onViewAll: () => void;
}

export const ContactMediaStrip: React.FC<ContactMediaStripProps> = ({ items, onOpenMedia, onViewAll }) => {
    return (
        <Box sx={{ borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider' }}>
            <ListItemButton
                sx={{ px: 2, py: 1.25, borderRadius: 0 }}
                onClick={onViewAll}
            >
                <ListItemDecorator sx={{ color: 'inherit', minWidth: 40 }}>
                    <PermMediaOutlinedIcon sx={{ fontSize: 20 }} />
                </ListItemDecorator>
                <ListItemContent>
                    <Typography level="body-sm">Multimedia</Typography>
                </ListItemContent>
                {items.length > 0 && (
                    <Typography level="body-xs" sx={{ mr: 0.5, color: 'text.tertiary' }}>{items.length}</Typography>
                )}
                <ChevronRightIcon sx={{ fontSize: 18, color: 'text.tertiary' }} />
            </ListItemButton>
            {items.length > 0 && (
                <Box sx={{
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: 0.5,
                    px: 2,
                    pt: 1.5,
                    pb: 1.5,
                }}>
                    {items.slice(0, 5).map((item) => (
                        <Sheet
                            key={item.fileId}
                            variant="soft"
                            onClick={() => item.url && onOpenMedia({ url: item.url, name: item.fileName, mimeType: item.mimeType, fileId: item.fileId })}
                            sx={{
                                flex: '1 1 0',
                                aspectRatio: '1',
                                borderRadius: 'sm',
                                overflow: 'hidden',
                                cursor: item.url ? 'pointer' : 'default',
                                border: '1px solid',
                                borderColor: 'divider',
                                transition: 'opacity 0.15s',
                                '&:hover': item.url ? { opacity: 0.8 } : undefined,
                            }}
                        >
                            {item.preview ? (
                                <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
                                    <Box
                                        component="img"
                                        src={item.preview}
                                        alt={item.fileName}
                                        sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                    />
                                    {isVideoMediaFile(item.mimeType, item.fileName) && (
                                        <Box sx={{
                                            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                            color: 'white', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 'sm',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24,
                                        }}>
                                            <PlayArrowIcon sx={{ fontSize: 16 }} />
                                        </Box>
                                    )}
                                </Box>
                            ) : (
                                <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'background.level1', color: 'text.tertiary', '& svg': { fontSize: 20 } }}>
                                    {getFileIcon(item.mimeType || '', item.fileName || '')}
                                </Box>
                            )}
                        </Sheet>
                    ))}
                </Box>
            )}
        </Box>
    );
};
