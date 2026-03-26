import React from 'react';
import {
    Box,
    Dropdown,
    IconButton,
    ListDivider,
    ListItemDecorator,
    Menu,
    MenuButton,
    MenuItem,
} from '@mui/joy';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ArchiveIcon from '@mui/icons-material/Archive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import PushPinIcon from '@mui/icons-material/PushPin';
import MarkChatUnreadIcon from '@mui/icons-material/MarkChatUnread';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';

interface GroupItemActionsProps {
    groupId: string;
    isFavorite?: boolean;
    onToggleFavorite: (groupId: string) => void;
    onLeaveRequest: () => void;
}

export const GroupItemActions: React.FC<GroupItemActionsProps> = ({
    groupId,
    isFavorite,
    onToggleFavorite,
    onLeaveRequest,
}) => (
    <Box
        className="group-options-btn"
        sx={{
            display: 'none',
            position: 'absolute',
            right: 0,
            top: '65%',
            transform: 'translateY(-50%)',
            zIndex: 2,
        }}
    >
        <Dropdown>
            <MenuButton
                slots={{ root: IconButton }}
                onClick={(event) => event.stopPropagation()}
                slotProps={{
                    root: {
                        variant: 'plain',
                        color: 'neutral',
                        size: 'sm',
                        sx: {
                            '--IconButton-size': '28px',
                            '&:hover': { backgroundColor: 'transparent' },
                            '&:active': { backgroundColor: 'transparent' },
                        },
                    },
                }}
            >
                <KeyboardArrowDownIcon sx={{ fontSize: '20px' }} />
            </MenuButton>
            <Menu placement="bottom-end" size="sm" sx={{ minWidth: 180, borderRadius: 'lg', '--ListItem-radius': '8px', boxShadow: 'lg', zIndex: 1000 }}>
                <MenuItem disabled><ListItemDecorator sx={{ color: 'inherit' }}><ArchiveIcon /></ListItemDecorator> Archivar chat</MenuItem>
                <MenuItem disabled><ListItemDecorator sx={{ color: 'inherit' }}><NotificationsOffIcon /></ListItemDecorator> Silenciar notificaciones</MenuItem>
                <MenuItem disabled><ListItemDecorator sx={{ color: 'inherit' }}><PushPinIcon /></ListItemDecorator> Fijar chat</MenuItem>
                <ListDivider />
                <MenuItem disabled><ListItemDecorator sx={{ color: 'inherit' }}><MarkChatUnreadIcon /></ListItemDecorator> Marcar como no leído</MenuItem>
                <MenuItem onClick={(event) => { event.stopPropagation(); onToggleFavorite(groupId); }}>
                    <ListItemDecorator sx={{ color: 'inherit' }}>{isFavorite ? <FavoriteIcon /> : <FavoriteBorderIcon />}</ListItemDecorator>
                    {isFavorite ? 'Quitar de Favoritos' : 'Añadir a Favoritos'}
                </MenuItem>
                <ListDivider />
                <MenuItem onClick={(event) => event.stopPropagation()}><ListItemDecorator sx={{ color: 'inherit' }}><DeleteSweepIcon /></ListItemDecorator> Vaciar chat</MenuItem>
                <MenuItem onClick={(event) => { event.stopPropagation(); onLeaveRequest(); }}><ListItemDecorator sx={{ color: 'inherit' }}><ExitToAppIcon /></ListItemDecorator> Eliminar grupo</MenuItem>
            </Menu>
        </Dropdown>
    </Box>
);