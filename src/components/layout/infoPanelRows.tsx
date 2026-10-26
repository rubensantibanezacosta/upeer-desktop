import React from 'react';
import { Box } from '@mui/joy';

export const rowButtonSx = {
    margin: 0,
    borderRadius: 'md',
    py: 1,
    px: 1,
    '&:hover': { backgroundColor: 'background.level1' },
    '&.Mui-disabled': { backgroundColor: 'transparent' },
} as const;

export const rowIconSx = {
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'text.tertiary',
} as const;

export const rowsSx = { '--ListItemDecorator-size': '36px', px: 1, py: 0 } as const;

export const actionButtonSx = {
    flex: 1,
    minWidth: 0,
    color: 'text.secondary',
    fontWeight: 500,
    '&:hover': { backgroundColor: 'background.level1', color: 'text.primary' },
} as const;

export const SectionSeparator: React.FC<{ inset?: number }> = ({ inset = 1 }) => (
    <Box sx={{ height: '1px', backgroundColor: 'divider', mx: inset, my: 1 }} />
);
