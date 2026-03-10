import React from 'react';
import { Box, IconButton, Typography } from '@mui/joy';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';

interface DragDropPlaceholderProps {
    onClose: () => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDragLeave?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
    label?: string;
}

export const DragDropPlaceholder: React.FC<DragDropPlaceholderProps> = ({
    onClose,
    onDragOver,
    onDragLeave,
    onDrop,
    label = 'Suelta los archivos aquí',
}) => (
    <>
        <Box sx={{ p: 2 }}>
            <IconButton variant="plain" color="neutral" onClick={onClose}>
                <CloseIcon />
            </IconButton>
        </Box>
        <Box sx={{ p: 4, display: 'flex', flexGrow: 1, pointerEvents: 'none' }}>
            <Box sx={{
                flexGrow: 1, display: 'flex', flexDirection: 'column',
                justifyContent: 'center', alignItems: 'center',
                border: '2px dashed', borderColor: 'divider', borderRadius: 'xl',
                backgroundColor: 'background.level1',
                transition: 'all 0.2s ease-in-out',
            }}>
                <AddIcon sx={{ fontSize: 48, color: 'text.primary', mb: 2 }} />
                <Typography level="h3" sx={{ color: 'text.primary', fontWeight: 500 }}>{label}</Typography>
            </Box>
        </Box>
    </>
);
