import React from 'react';
import { Box } from '@mui/joy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DescriptionIcon from '@mui/icons-material/Description';
import { isPdfFile, toMediaUrl } from '../../../utils/fileUtils.js';
import { THUMB_GAP, THUMB_WIDTH, VISIBLE_BUFFER, isImageThumbnailItem, isVideo, type MediaItem } from './mediaViewerSupport.js';

interface MediaViewerThumbnailsProps {
    items: MediaItem[];
    currentIndex: number;
    generatedThumbnails: Record<string, string>;
    onSelect: (index: number) => void;
}

export const MediaViewerThumbnails: React.FC<MediaViewerThumbnailsProps> = ({ items, currentIndex, generatedThumbnails, onSelect }) => {
    const visibleCount = Math.min(VISIBLE_BUFFER * 2 + 1, items.length);
    let startIndex = currentIndex - VISIBLE_BUFFER;
    if (startIndex < 0) {
        startIndex = 0;
    }
    if (startIndex + visibleCount > items.length) {
        startIndex = items.length - visibleCount;
    }

    return (
        <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', backdropFilter: 'blur(4px)', zIndex: 30 }} onClick={(event) => event.stopPropagation()}>
            <Box sx={{ display: 'flex', gap: `${THUMB_GAP}px`, alignItems: 'center' }}>
                {Array.from({ length: visibleCount }, (_, offset) => {
                    const index = startIndex + offset;
                    const item = items[index];
                    const thumb = item.thumbnail || generatedThumbnails[item.fileId];
                    const isPdf = isPdfFile(item.mimeType, item.fileName);
                    const showImg = !isPdf && ((thumb && thumb.length > 10) || (isImageThumbnailItem(item) && item.url));
                    const isCurrent = index === currentIndex;

                    return (
                        <Box key={item.fileId} onClick={() => onSelect(index)} sx={{ width: THUMB_WIDTH, height: THUMB_WIDTH, flexShrink: 0, borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', border: '2px solid', borderColor: isCurrent ? 'primary.400' : 'transparent', backgroundColor: 'neutral.800', transform: isCurrent ? 'scale(1.15)' : 'scale(1)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', opacity: isCurrent ? 1 : 0.5, position: 'relative', '&:hover': { borderColor: isCurrent ? 'primary.400' : 'rgba(255,255,255,0.3)', opacity: 0.85 } }}>
                            {showImg ? (
                                <img src={thumb || (item.url && !item.url.startsWith('data:') ? toMediaUrl(item.url) : item.url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(event) => { (event.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                                <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {isPdf ? <DescriptionIcon sx={{ fontSize: 24, color: 'neutral.400' }} /> : <PlayArrowIcon sx={{ fontSize: 24, color: 'neutral.400' }} />}
                                </Box>
                            )}
                            {isVideo(item.mimeType, item.fileName) && (
                                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'white', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 'sm', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <PlayArrowIcon sx={{ fontSize: 14 }} />
                                </Box>
                            )}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};