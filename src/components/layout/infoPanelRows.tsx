import React from 'react';
import { Box } from '@mui/joy';

export const INFO_ROW_HEIGHT = '56px';

export const rowButtonSx = {
    margin: 0,
    height: INFO_ROW_HEIGHT,
    minHeight: INFO_ROW_HEIGHT,
    borderRadius: 'md',
    py: 0,
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
    width: 44,
    height: 44,
    borderRadius: '50%',
    backgroundColor: 'background.level1',
    color: 'text.secondary',
    '&:hover': { backgroundColor: 'background.level2', color: 'text.primary' },
    '&.Mui-disabled': { backgroundColor: 'background.level1', opacity: 0.4 },
} as const;

export const actionsRowSx = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    px: 2,
    pt: 1,
    pb: 1.5,
} as const;

export const SectionSeparator: React.FC<{ inset?: number }> = ({ inset = 1 }) => (
    <Box sx={{ height: '1px', backgroundColor: 'divider', mx: inset, my: 1 }} />
);
