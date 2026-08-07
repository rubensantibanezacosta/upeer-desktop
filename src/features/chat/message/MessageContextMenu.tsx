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
import PushPinIcon from '@mui/icons-material/PushPin';
import StarBorderOutlinedIcon from '@mui/icons-material/StarBorderOutlined';
import StarIcon from '@mui/icons-material/Star';
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useChatActionsStore } from '../../../store/useChatActionsStore.js';

interface MessageContextMenuProps {
    msgId?: string;
    isMe: boolean;
    isFile: boolean;
    fileCompleted: boolean;
    onReply: () => void;
    onDelete: () => void;
    onEdit?: () => void;
    onForward?: () => void;
    onDownload?: () => void;
    sx?: React.CSSProperties;
}

export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
    msgId,
    isMe,
    isFile,
    fileCompleted,
    onReply,
    onDelete,
    onEdit,
    onForward,
    onDownload,
    sx,
}) => {
    const msgPrefs = useChatActionsStore((state) => (msgId ? state.messagePrefs[msgId] : undefined));
    const toggleMessage = useChatActionsStore((state) => state.toggleMessage);
    const pinned = msgPrefs?.pinned ?? false;
    const starred = msgPrefs?.starred ?? false;
    const reported = msgPrefs?.reported ?? false;
    const toggle = (key: 'pinned' | 'starred' | 'reported') => (event: React.SyntheticEvent) => {
        event.stopPropagation();
        if (msgId) toggleMessage(msgId, key);
    };
    return (
        <Dropdown>
            <MenuButton
                slots={{ root: IconButton }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                slotProps={{
                    root: {
                        'aria-label': `Abrir acciones del mensaje ${msgId || ''}`,
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
                            ...sx,
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
                {isFile && fileCompleted && onDownload && (
                    <MenuItem onClick={onDownload}>
                        <ListItemDecorator sx={{ color: 'inherit' }}><DownloadOutlinedIcon /></ListItemDecorator>
                        Descargar
                    </MenuItem>
                )}

                <MenuItem onClick={() => setTimeout(() => onForward?.(), 0)}>
                    <ListItemDecorator sx={{ color: 'inherit' }}><ShortcutOutlinedIcon /></ListItemDecorator>
                    Reenviar
                </MenuItem>

                <ListDivider />

                <MenuItem onClick={toggle('pinned')}>
                    <ListItemDecorator sx={{ color: 'inherit' }}>{pinned ? <PushPinIcon color="primary" /> : <PushPinOutlinedIcon />}</ListItemDecorator>
                    {pinned ? 'Desfijar mensaje' : 'Fijar mensaje'}
                </MenuItem>

                <MenuItem onClick={toggle('starred')}>
                    <ListItemDecorator sx={{ color: 'inherit' }}>{starred ? <StarIcon color="warning" /> : <StarBorderOutlinedIcon />}</ListItemDecorator>
                    {starred ? 'Quitar destacado' : 'Destacar'}
                </MenuItem>

                <ListDivider />

                <MenuItem onClick={toggle('reported')}>
                    <ListItemDecorator sx={{ color: 'inherit' }}>{reported ? <ThumbDownIcon color="error" /> : <ThumbDownOutlinedIcon />}</ListItemDecorator>
                    {reported ? 'Quitar reporte' : 'Reportar'}
                </MenuItem>

                {onEdit && (
                    <MenuItem onClick={onEdit}>
                        <ListItemDecorator sx={{ color: 'inherit' }}><EditOutlinedIcon /></ListItemDecorator>
                        Editar
                    </MenuItem>
                )}

                {isMe && (
                    <MenuItem onClick={onDelete} color="danger">
                        <ListItemDecorator sx={{ color: 'inherit' }}><DeleteOutlineIcon /></ListItemDecorator>
                        Eliminar
                    </MenuItem>
                )}
            </Menu>
        </Dropdown>
    );
};
