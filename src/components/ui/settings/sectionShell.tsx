import React from 'react';
import { Box, Typography } from '@mui/joy';

export const cardBodySx = {
    display: 'flex',
    flexDirection: 'column',
} as const;

export const SettingsCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>{children}</Box>
);

interface CardGroupLabelProps {
    icon?: React.ReactNode;
    title: string;
    badge?: React.ReactNode;
    description?: string;
    action?: React.ReactNode;
}

export const CardGroupLabel: React.FC<CardGroupLabelProps> = ({ icon, title, badge, description, action }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, px: 0.5, mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {icon && <Box sx={{ display: 'flex', color: 'text.tertiary' }}>{icon}</Box>}
            <Typography level="title-sm" sx={{ minWidth: 0 }}>
                {title}
            </Typography>
            {badge}
            <Box sx={{ flex: 1 }} />
            {action}
        </Box>
        {description && (
            <Typography level="body-xs" sx={{ color: 'text.tertiary', maxWidth: '62ch' }}>
                {description}
            </Typography>
        )}
    </Box>
);

interface SettingsSectionProps {
    icon: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
    icon,
    title,
    description,
    action,
    children,
}) => {
    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                maxWidth: 780,
                mx: 'auto',
                px: 3,
                py: 3,
                minWidth: 0,
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
                <Box
                    sx={{
                        width: 34,
                        height: 34,
                        flex: 'none',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'primary.300',
                        bgcolor: 'primary.softBg',
                        '& svg': { fontSize: '18px' },
                    }}
                >
                    {icon}
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.375, minWidth: 0, flex: 1 }}>
                    <Typography level="title-lg">{title}</Typography>
                    {description && (
                        <Typography level="body-sm" sx={{ color: 'text.tertiary', maxWidth: '68ch' }}>
                            {description}
                        </Typography>
                    )}
                </Box>
                {action}
            </Box>

            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                    '& > * + *': {
                        position: 'relative',
                        mt: 3.5,
                        '&::before': {
                            content: '""',
                            position: 'absolute',
                            top: '-18px',
                            left: '40px',
                            right: '40px',
                            height: '1px',
                            backgroundColor: 'divider',
                        },
                    },
                }}
            >
                {children}
            </Box>
        </Box>
    );
};
