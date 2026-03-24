import React from 'react';
import { Box, IconButton, Typography, AspectRatio } from '@mui/joy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PermMediaOutlinedIcon from '@mui/icons-material/PermMediaOutlined';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { SharedMediaItem } from './ContactMediaStrip.js';
import { getFileIcon } from '../../utils/fileIcons.js';
import { isVideoMediaFile } from './contactInfoHelpers.js';

interface ContactMediaExplorerProps {
    items: SharedMediaItem[];
    onBack: () => void;
    onOpenMedia: (media: { url: string; name: string; mimeType: string; fileId: string }) => void;
}

export const ContactMediaExplorer: React.FC<ContactMediaExplorerProps> = ({ items, onBack, onOpenMedia }) => {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'background.surface' }}>
            <Box sx={{
                height: '60px',
                px: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
                flexShrink: 0,
            }}>
                <IconButton size="sm" variant="plain" color="neutral" onClick={onBack}>
                    <ArrowBackIcon />
                </IconButton>
                <Typography level="title-md" sx={{ fontWeight: 600 }}>Multimedia</Typography>
            </Box>

            <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 1 }}>
                {items.length === 0 ? (
                    <Box sx={{ textAlign: 'center', mt: 4 }}>
                        <PermMediaOutlinedIcon sx={{ fontSize: 40, color: 'text.tertiary', mb: 1 }} />
                        <Typography level="body-sm" color="neutral">No hay archivos multimedia</Typography>
                    </Box>
                ) : (
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}>
                        {items.map(item => (
                            <AspectRatio
                                key={item.fileId}
                                ratio="1"
                                onClick={() => item.url && onOpenMedia({ url: item.url, name: item.fileName, mimeType: item.mimeType, fileId: item.fileId })}
                                sx={{
                                    cursor: item.url ? 'pointer' : 'default',
                                    borderRadius: 'xs',
                                    overflow: 'hidden',
                                    '&:hover': item.url ? { opacity: 0.8 } : undefined,
                                }}
                            >
                                {item.preview ? (
                                    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
                                        <Box
                                            component="img"
                                            src={item.preview}
                                            alt={item.fileName}
                                            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                        {isVideoMediaFile(item.mimeType, item.fileName) && (
                                            <Box sx={{
                                                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                                color: 'white', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 'sm',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
                                            }}>
                                                <PlayArrowIcon sx={{ fontSize: 18 }} />
                                            </Box>
                                        )}
                                    </Box>
                                ) : (
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.level1', color: 'text.tertiary', '& svg': { fontSize: 24 } }}>
                                        {getFileIcon(item.mimeType || '', item.fileName || '')}
                                    </Box>
                                )}
                            </AspectRatio>
                        ))}
                    </Box>
                )}
            </Box>
        </Box>
    );
};
