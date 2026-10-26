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
import { Reply, ChevronDown, Download, Share2, Pin, Star, ThumbsDown, Trash2, Pencil } from 'lucide-react';
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
                <ChevronDown style={{ fontSize: 20 }} />
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
                    <ListItemDecorator sx={{ color: 'inherit' }}><Reply /></ListItemDecorator>
                    Responder
                </MenuItem>
                {isFile && fileCompleted && onDownload && (
                    <MenuItem onClick={onDownload}>
                        <ListItemDecorator sx={{ color: 'inherit' }}><Download /></ListItemDecorator>
                        Descargar
                    </MenuItem>
                )}

                <MenuItem onClick={() => setTimeout(() => onForward?.(), 0)}>
                    <ListItemDecorator sx={{ color: 'inherit' }}><Share2 /></ListItemDecorator>
                    Reenviar
                </MenuItem>

                <ListDivider />

                <MenuItem onClick={toggle('pinned')}>
                    <ListItemDecorator sx={{ color: 'inherit' }}>{pinned ? <Pin fill="currentColor" style={{ color: 'var(--joy-palette-primary-main)' }} /> : <Pin />}</ListItemDecorator>
                    {pinned ? 'Desfijar mensaje' : 'Fijar mensaje'}
                </MenuItem>

                <MenuItem onClick={toggle('starred')}>
                    <ListItemDecorator sx={{ color: 'inherit' }}>{starred ? <Star fill="currentColor" style={{ color: 'var(--joy-palette-warning-main)' }} /> : <Star />}</ListItemDecorator>
                    {starred ? 'Quitar destacado' : 'Destacar'}
                </MenuItem>

                <ListDivider />

                <MenuItem onClick={toggle('reported')}>
                    <ListItemDecorator sx={{ color: 'inherit' }}>{reported ? <ThumbsDown fill="currentColor" style={{ color: 'var(--joy-palette-danger-main)' }} /> : <ThumbsDown />}</ListItemDecorator>
                    {reported ? 'Quitar reporte' : 'Reportar'}
                </MenuItem>

                {onEdit && (
                    <MenuItem onClick={onEdit}>
                        <ListItemDecorator sx={{ color: 'inherit' }}><Pencil /></ListItemDecorator>
                        Editar
                    </MenuItem>
                )}

                {isMe && (
                    <MenuItem onClick={onDelete} color="danger">
                        <ListItemDecorator sx={{ color: 'inherit' }}><Trash2 /></ListItemDecorator>
                        Eliminar
                    </MenuItem>
                )}
            </Menu>
        </Dropdown>
    );
};
