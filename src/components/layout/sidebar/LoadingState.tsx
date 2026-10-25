import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/joy';

interface LoadingStateProps {
    label: string;
    compact?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ label, compact = false }) => (
    <Box
        role="status"
        aria-label={label}
        sx={{
            flex: compact ? '0 0 auto' : 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.25,
            px: 3,
            py: compact ? 3 : 6,
            textAlign: 'center',
            color: 'text.tertiary',
        }}
    >
        <CircularProgress size={compact ? 'sm' : 'md'} />
        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>{label}</Typography>
    </Box>
);
