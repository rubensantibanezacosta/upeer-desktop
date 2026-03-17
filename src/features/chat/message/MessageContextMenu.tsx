import React from 'react';
import {
    IconButton,
    ListItemDecorator,
    ListDivider,
    Menu,
    MenuItem,
    Dropdown,
    MenuButton,
} from '@mui/joy';
import ReplyIcon from '@mui/icons-material/Reply';

import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import ShortcutOutlinedIcon from '@mui/icons-material/ShortcutOutlined';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import StarBorderOutlinedIcon from '@mui/icons-material/StarBorderOutlined';
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

interface MessageContextMenuProps {
    msgId: string;
    isMe: boolean;
    isFile: boolean;
    fileCompleted: boolean;
    onReply: () => void;
    onDelete: () => void;
    sx?: any;
}

export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
    msgId,
    isMe,
    isFile,
    fileCompleted,
    onReply,
    onDelete,
    sx,
}) => {
    return (
        <Dropdown>
            <MenuButton
                slots={{ root: IconButton }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                slotProps={{
                    root: {
                        variant: 'plain' as const,
                        color: 'neutral' as const,
                        size: 'sm' as const,
                        sx: {
                            '--IconButton-size': '26px',
                            borderRadius: 'sm',
                            flexShrink: 0,
                            zIndex: 10,
                            opacity: 0.7,
                            '&:hover': {
                                backgroundColor: 'background.level1',
                                opacity: 1,
                            },
                            '&:active': {
                                backgroundColor: 'background.level2',
                            },
                            ...sx
                        }
                    }
                }}
            >
                <KeyboardArrowDownIcon sx={{ fontSize: '20px' }} />
            </MenuButton>

            <Menu
                placement="bottom-end"
                size="sm"
                sx={{
                    minWidth: 180,
                    borderRadius: 'lg',
                    '--ListItem-radius': '8px',
                    boxShadow: 'lg',
                    zIndex: 1300,
                }}
            >
                <MenuItem onClick={onReply}>
                    <ListItemDecorator sx={{ color: 'inherit' }}><ReplyIcon /></ListItemDecorator>
                    Responder
                </MenuItem>
                {isFile && fileCompleted && (
                    <MenuItem>
                        <ListItemDecorator sx={{ color: 'inherit' }}><DownloadOutlinedIcon /></ListItemDecorator>
                        Descargar
                    </MenuItem>
                )}

                <MenuItem>
                    <ListItemDecorator sx={{ color: 'inherit' }}><ShortcutOutlinedIcon /></ListItemDecorator>
                    Reenviar
                </MenuItem>

                <ListDivider />

                <MenuItem>
                    <ListItemDecorator sx={{ color: 'inherit' }}><PushPinOutlinedIcon /></ListItemDecorator>
                    Fijar
                </MenuItem>

                <MenuItem>
                    <ListItemDecorator sx={{ color: 'inherit' }}><StarBorderOutlinedIcon /></ListItemDecorator>
                    Destacar
                </MenuItem>

                <ListDivider />

                <MenuItem>
                    <ListItemDecorator sx={{ color: 'inherit' }}><ThumbDownOutlinedIcon /></ListItemDecorator>
                    Reportar
                </MenuItem>

                {isMe && (
                    <MenuItem onClick={onDelete}>
                        <ListItemDecorator sx={{ color: 'inherit' }}><DeleteOutlineIcon /></ListItemDecorator>
                        Eliminar
                    </MenuItem>
                )}
            </Menu>
        </Dropdown>
    );
};
