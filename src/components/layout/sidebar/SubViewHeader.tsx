import React from 'react';
import { Box, Typography, IconButton } from '@mui/joy';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

interface SubViewHeaderProps {
    title: string;
    onBack: () => void;
}

export const SubViewHeader: React.FC<SubViewHeaderProps> = ({ title, onBack }) => (
    <Box sx={{
        display: 'flex',
        alignItems: 'center',
        px: 2,
        py: 0.75,
        minHeight: 56,
        borderBottom: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.surface',
        gap: 0.5,
        flexShrink: 0,
    }}>
        <IconButton variant="plain" color="neutral" onClick={onBack} size="sm">
            <ArrowBackIcon />
        </IconButton>
        <Typography level="title-md" sx={{ fontWeight: 600, ml: 0.5 }}>{title}</Typography>
    </Box>
);