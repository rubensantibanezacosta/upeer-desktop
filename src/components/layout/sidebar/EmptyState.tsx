import React from 'react';
import { Box, Typography, Button } from '@mui/joy';

interface EmptyStateProps {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    action?: { label: string; onClick: () => void };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, subtitle, action }) => (
    <Box sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        px: 3,
        py: 6,
        textAlign: 'center',
        color: 'text.tertiary',
    }}>
        <Box sx={{ fontSize: 48, opacity: 0.35 }}>{icon}</Box>
        <Typography level="title-md" sx={{ fontWeight: 600, color: 'text.secondary' }}>{title}</Typography>
        <Typography level="body-sm" sx={{ color: 'text.tertiary', maxWidth: 220 }}>{subtitle}</Typography>
        {action && (
            <Button size="sm" variant="soft" color="primary" onClick={action.onClick} sx={{ mt: 0.5 }}>
                {action.label}
            </Button>
        )}
    </Box>
);