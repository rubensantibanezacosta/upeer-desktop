import React from 'react';
import {
    Box, IconButton, Tooltip, Dropdown, Menu, MenuItem, MenuButton, ListItemDecorator,
} from '@mui/joy';
import CropIcon from '@mui/icons-material/Crop';
import EditIcon from '@mui/icons-material/Edit';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import TuneIcon from '@mui/icons-material/Tune';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import AppsIcon from '@mui/icons-material/Apps';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

type EditMode = 'crop' | 'draw' | 'text' | 'sticker' | null;

interface ImageEditToolbarProps {
    editMode: EditMode;
    drawColor: string;
    stickerEmoji: string;
    canReset: boolean;
    onModeChange: (mode: EditMode) => void;
    onColorChange: (color: string) => void;
    onStickerEmojiChange: (emoji: string) => void;
    onRotate: () => void;
    onReset: () => void;
}

export const DRAW_COLORS = ['#ff5252', '#ffeb3b', '#4caf50', '#2196f3', '#ffffff', '#000000'];

export const STICKER_EMOJIS = ['😀', '😂', '😍', '🔥', '❤️', '🎉', '👍', '⭐'];

const toolbarButtonSx = {
    color: 'white',
    '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' },
};

const isActiveMode = (current: EditMode, target: EditMode) => current === target;

export const ImageEditToolbar: React.FC<ImageEditToolbarProps> = ({
    editMode,
    drawColor,
    stickerEmoji,
    canReset,
    onModeChange,
    onColorChange,
    onStickerEmojiChange,
    onRotate,
    onReset,
}) => {
    return (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
            <Tooltip title={isActiveMode(editMode, 'crop') ? 'Cancelar recorte' : 'Recortar'} variant="soft" sx={{ zIndex: 3000 }}>
                <IconButton variant="plain" color={isActiveMode(editMode, 'crop') ? 'primary' : 'neutral'} sx={toolbarButtonSx} onClick={() => onModeChange('crop')}>
                    <CropIcon />
                </IconButton>
            </Tooltip>
            <Tooltip title={isActiveMode(editMode, 'draw') ? 'Cancelar dibujo' : 'Dibujar'} variant="soft" sx={{ zIndex: 3000 }}>
                <IconButton variant="plain" color={isActiveMode(editMode, 'draw') ? 'primary' : 'neutral'} sx={toolbarButtonSx} onClick={() => onModeChange('draw')}>
                    <EditIcon />
                </IconButton>
            </Tooltip>
            <Tooltip title={isActiveMode(editMode, 'text') ? 'Cancelar texto' : 'Texto'} variant="soft" sx={{ zIndex: 3000 }}>
                <IconButton variant="plain" color={isActiveMode(editMode, 'text') ? 'primary' : 'neutral'} sx={toolbarButtonSx} onClick={() => onModeChange('text')}>
                    <TextFieldsIcon />
                </IconButton>
            </Tooltip>
            <Tooltip title="Rotar 90°" variant="soft" sx={{ zIndex: 3000 }}>
                <IconButton variant="plain" color="neutral" sx={toolbarButtonSx} onClick={onRotate}>
                    <TuneIcon />
                </IconButton>
            </Tooltip>
            <Tooltip title={isActiveMode(editMode, 'sticker') ? 'Cancelar stickers' : 'Stickers'} variant="soft" sx={{ zIndex: 3000 }}>
                <IconButton variant="plain" color={isActiveMode(editMode, 'sticker') ? 'primary' : 'neutral'} sx={toolbarButtonSx} onClick={() => onModeChange('sticker')}>
                    <StickyNote2OutlinedIcon />
                </IconButton>
            </Tooltip>
            <Tooltip title="Más" variant="soft" sx={{ zIndex: 3000 }}>
                <Dropdown>
                    <MenuButton slots={{ root: IconButton }} slotProps={{ root: { variant: 'plain', color: 'neutral', sx: toolbarButtonSx, 'aria-label': 'Más opciones de edición' } }}>
                        <AppsIcon />
                    </MenuButton>
                    <Menu size="sm" placement="bottom-end" sx={{ minWidth: 200, borderRadius: 'lg', '--ListItem-radius': '8px', boxShadow: 'lg', zIndex: 3000 }}>
                        <MenuItem onClick={onReset} disabled={!canReset}>
                            <ListItemDecorator sx={{ color: 'inherit' }}><RestartAltIcon /></ListItemDecorator>
                            Restablecer imagen original
                        </MenuItem>
                    </Menu>
                </Dropdown>
            </Tooltip>
            {(editMode === 'draw' || editMode === 'text') && (
                <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
                    {DRAW_COLORS.map((color) => (
                        <Tooltip key={color} title={color} variant="soft">
                            <IconButton size="sm" variant="plain" sx={{ width: 24, height: 24, minWidth: 24, p: 0, borderRadius: '50%', backgroundColor: color, border: drawColor === color ? '2px solid white' : '2px solid rgba(255,255,255,0.3)' }} onClick={() => onColorChange(color)} aria-label={`Color de edición ${color}`} />
                        </Tooltip>
                    ))}
                </Box>
            )}
            {editMode === 'sticker' && (
                <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.25, ml: 0.5, py: 0.5, px: 1, borderRadius: 'lg', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                    {STICKER_EMOJIS.map((emoji) => (
                        <Tooltip key={emoji} title={`Pegar ${emoji}`} variant="soft">
                            <IconButton size="sm" variant="plain" sx={{ fontSize: 18, borderRadius: '50%', border: stickerEmoji === emoji ? '2px solid white' : '2px solid transparent' }} onClick={() => onStickerEmojiChange(emoji)} aria-label={`Sticker ${emoji}`}>
                                {emoji}
                            </IconButton>
                        </Tooltip>
                    ))}
                </Box>
            )}
        </Box>
    );
};