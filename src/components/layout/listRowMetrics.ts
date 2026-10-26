import type { SxProps } from '@mui/joy/styles/types';

export const LIST_ROW_AVATAR_SIZE = '3rem';

export const LIST_ROW_MIN_HEIGHT = '72px';

export const listRowListItemSx: SxProps = {
    p: 0,
    mb: 0.5,
};

export const listRowButtonSx: SxProps = {
    height: LIST_ROW_MIN_HEIGHT,
    minHeight: LIST_ROW_MIN_HEIGHT,
    px: 1.25,
    margin: 0,
    borderRadius: '10px',
    transition: 'background-color 0.15s ease',
    '&:hover': { backgroundColor: 'background.level1' },
    '&.Mui-selected': { backgroundColor: 'background.level1' },
    '&.Mui-selected:hover': { backgroundColor: 'background.level1' },
};

export const listRowDecoratorSx: SxProps = {
    mr: 0.25,
    minInlineSize: LIST_ROW_AVATAR_SIZE,
};

export const listRowAvatarSx: SxProps = {
    width: LIST_ROW_AVATAR_SIZE,
    height: LIST_ROW_AVATAR_SIZE,
    flexShrink: 0,
};
