import React from 'react';
import { Box, IconButton, Typography } from '@mui/joy';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import ImageIcon from '@mui/icons-material/Image';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import DescriptionIcon from '@mui/icons-material/Description';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

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

const getFileIcon = (fileType: string, size: number = 24) => {
    if (fileType.startsWith('image/')) return <ImageIcon sx={{ fontSize: size }} />;
    if (fileType.startsWith('audio/')) return <AudioFileIcon sx={{ fontSize: size }} />;
    if (fileType.startsWith('video/')) return <VideoFileIcon sx={{ fontSize: size }} />;
    if (fileType.includes('pdf')) return <DescriptionIcon sx={{ fontSize: size }} />;
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
    return (
        <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            overflowX: 'auto',
            py: 1,
            '&::-webkit-scrollbar': { display: 'none' },
        }}>
            {files.map((file, index) => (
                <Box
                    key={file.path}
                    onClick={() => onSelect(index)}
                    sx={{
                        position: 'relative',
                        width: 56, height: 56,
                        borderRadius: '8px',
                        border: '2px solid',
                        borderColor: selectedIndex === index ? 'primary.main' : 'transparent',
                        transition: 'all 0.2s',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        backgroundColor: 'background.level1',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        '&:hover': {
                            borderColor: selectedIndex === index ? 'primary.main' : 'neutral.outlinedBorder',
                            backgroundColor: 'background.level2',
                        },
                    }}
                >
                    {previews[file.path]?.thumbnail ? (
                        <Box
                            component="img"
                            src={previews[file.path].thumbnail}
                            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        getFileIcon(file.type, 24)
                    )}

                    {files.length > 1 && (
                        <IconButton
                            size="sm" variant="solid" color="danger"
                            onClick={(e) => { e.stopPropagation(); onRemove(index); }}
                            className="remove-btn"
                            sx={{
                                position: 'absolute', top: -8, right: -8,
                                minWidth: 16, minHeight: 16, width: 16, height: 16, p: 0,
                                borderRadius: '50%',
                                opacity: 0, transform: 'scale(0.5)',
                                transition: 'all 0.2s',
                                display: 'flex', zIndex: 1,
                            }}
                        >
                            <CloseIcon sx={{ fontSize: 10 }} />
                        </IconButton>
                    )}
                    <style>{`div:hover > .remove-btn { opacity: 1; transform: scale(1); top: 2px; right: 2px; }`}</style>
                </Box>
            ))}

            <IconButton
                variant="outlined" color="neutral" onClick={onAddMore}
                sx={{ width: 56, height: 56, borderRadius: '8px' }}
            >
                <AddIcon />
            </IconButton>
        </Box>
    );
};
