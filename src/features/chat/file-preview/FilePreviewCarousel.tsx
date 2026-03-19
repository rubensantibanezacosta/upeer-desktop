import React from 'react';
import { Box, IconButton } from '@mui/joy';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import ImageIcon from '@mui/icons-material/Image';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import DescriptionIcon from '@mui/icons-material/Description';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { getMimeType } from '../../../utils/fileUtils.js';

const THUMB_WIDTH = 56;
const THUMB_GAP = 12;
const VISIBLE_COUNT = 5;

interface FileInfo {
    path: string;
    name: string;
    size: number;
    type: string;
    lastModified: number;
}

interface FilePreviewCarouselProps {
    files: FileInfo[];
    selectedIndex: number;
    previews: Record<string, { previewUrl: string; thumbnail: string }>;
    onSelect: (index: number) => void;
    onRemove: (index: number) => void;
    onAddMore: () => void;
}

const getFileIcon = (fileType: string, fileName: string, size = 24) => {
    let effectiveType = fileType;
    if (!effectiveType || effectiveType === 'application/octet-stream') {
        effectiveType = getMimeType(fileName);
    }
    if (effectiveType.startsWith('image/')) return <ImageIcon sx={{ fontSize: size }} />;
    if (effectiveType.startsWith('audio/')) return <AudioFileIcon sx={{ fontSize: size }} />;
    if (effectiveType.startsWith('video/')) return <VideoFileIcon sx={{ fontSize: size }} />;
    if (effectiveType.includes('pdf')) return <DescriptionIcon sx={{ fontSize: size }} />;
    return <InsertDriveFileIcon sx={{ fontSize: size }} />;
};

export const FilePreviewCarousel: React.FC<FilePreviewCarouselProps> = ({
    files,
    selectedIndex,
    previews,
    onSelect,
    onRemove,
    onAddMore,
}) => {
    const visibleCount = Math.min(VISIBLE_COUNT, files.length);
    let startIdx = selectedIndex - Math.floor(VISIBLE_COUNT / 2);
    if (startIdx < 0) startIdx = 0;
    if (startIdx + visibleCount > files.length) startIdx = Math.max(0, files.length - visibleCount);

    return (
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: `${THUMB_GAP}px`,
            py: 1,
        }}>
            {Array.from({ length: visibleCount }, (_, i) => {
                const index = startIdx + i;
                const file = files[index];
                const isSelected = selectedIndex === index;
                
                return (
                    <Box
                        key={file.path}
                        onClick={() => onSelect(index)}
                        sx={{
                            position: 'relative',
                            width: THUMB_WIDTH, height: THUMB_WIDTH,
                            borderRadius: '8px',
                            border: '2px solid',
                            borderColor: isSelected ? 'primary.main' : 'transparent',
                            transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            cursor: 'pointer',
                            overflow: 'hidden',
                            backgroundColor: 'background.level1',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: isSelected ? 1 : 0.5,
                            '&:hover': {
                                borderColor: isSelected ? 'primary.main' : 'neutral.outlinedBorder',
                                opacity: 0.85,
                            },
                        }}
                    >
                        {previews[file.path]?.thumbnail ? (
                            <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
                                <Box
                                    component="img"
                                    src={previews[file.path].thumbnail}
                                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                                {(file.type.startsWith('video/') || getMimeType(file.name).startsWith('video/')) && (
                                    <Box sx={{
                                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                        color: 'white', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 'sm',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        width: 20, height: 20,
                                    }}>
                                        <PlayArrowIcon sx={{ fontSize: 14 }} />
                                    </Box>
                                )}
                            </Box>
                        ) : (
                            getFileIcon(file.type, file.name, 24)
                        )}

                        {files.length > 1 && (
                            <IconButton
                                size="sm" variant="solid" color="danger"
                                onClick={(e) => { e.stopPropagation(); onRemove(index); }}
                                sx={{
                                    position: 'absolute', top: 2, right: 2,
                                    minWidth: 16, minHeight: 16, width: 16, height: 16, p: 0,
                                    borderRadius: 'sm',
                                    opacity: 0,
                                    transition: 'opacity 0.2s',
                                    display: 'flex', zIndex: 1,
                                    '&:hover': { opacity: 1 },
                                }}
                                className="remove-btn"
                            >
                                <CloseIcon sx={{ fontSize: 10 }} />
                            </IconButton>
                        )}
                        <style>{`div:hover > .remove-btn { opacity: 1 !important; }`}</style>
                    </Box>
                );
            })}

            <IconButton
                variant="outlined" color="neutral" onClick={onAddMore}
                sx={{ width: THUMB_WIDTH, height: THUMB_WIDTH, borderRadius: '8px', flexShrink: 0 }}
            >
                <AddIcon />
            </IconButton>
        </Box>
    );
};
