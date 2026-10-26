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
import { ChevronDown, Archive, BellOff, Pin, Mail, Heart, Eraser, LogOut } from 'lucide-react';
import { useChatActionsStore } from '../../store/useChatActionsStore.js';

interface GroupItemActionsProps {
    groupId: string;
    isFavorite?: boolean;
    onToggleFavorite: (groupId: string) => void;
    onLeaveRequest: () => void;
    onClearChat?: () => void;
}

export const GroupItemActions: React.FC<GroupItemActionsProps> = ({
    groupId,
    isFavorite,
    onToggleFavorite,
    onLeaveRequest,
    onClearChat,
}) => {
    const prefs = useChatActionsStore((state) => state.groupPrefs[groupId]);
    const toggleGroup = useChatActionsStore((state) => state.toggleGroup);
    const archived = prefs?.archived ?? false;
    const muted = prefs?.muted ?? false;
    const pinned = prefs?.pinned ?? false;
    const unread = prefs?.unread ?? false;
    return (
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
                        'aria-label': `Abrir acciones del grupo ${groupId}`,
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
                <ChevronDown style={{ fontSize: 20 }} />
            </MenuButton>
            <Menu placement="bottom-end" size="sm" sx={{ minWidth: 180, borderRadius: 'lg', '--ListItem-radius': '8px', boxShadow: 'lg', zIndex: 1000 }}>
                <MenuItem onClick={(event) => { event.stopPropagation(); toggleGroup(groupId, 'archived'); }}>
                    <ListItemDecorator sx={{ color: 'inherit' }}><Archive style={{ fontSize: 18 }} /></ListItemDecorator>
                    {archived ? 'Desarchivar chat' : 'Archivar chat'}
                </MenuItem>
                <MenuItem onClick={(event) => { event.stopPropagation(); toggleGroup(groupId, 'muted'); }}>
                    <ListItemDecorator sx={{ color: 'inherit' }}><BellOff style={{ fontSize: 18 }} /></ListItemDecorator>
                    {muted ? 'Reactivar notificaciones' : 'Silenciar notificaciones'}
                </MenuItem>
                <MenuItem onClick={(event) => { event.stopPropagation(); toggleGroup(groupId, 'pinned'); }}>
                    <ListItemDecorator sx={{ color: 'inherit' }}><Pin style={{ fontSize: 18 }} /></ListItemDecorator>
                    {pinned ? 'Desfijar chat' : 'Fijar chat'}
                </MenuItem>
                <ListDivider />
                <MenuItem onClick={(event) => { event.stopPropagation(); toggleGroup(groupId, 'unread'); }}>
                    <ListItemDecorator sx={{ color: 'inherit' }}><Mail style={{ fontSize: 18 }} /></ListItemDecorator>
                    {unread ? 'Marcar como leído' : 'Marcar como no leído'}
                </MenuItem>
                <MenuItem onClick={(event) => { event.stopPropagation(); onToggleFavorite(groupId); }}>
                    <ListItemDecorator sx={{ color: 'inherit' }}><Heart style={{ fontSize: 18 }} fill={isFavorite ? 'currentColor' : 'none'} /></ListItemDecorator>
                    {isFavorite ? 'Quitar de Favoritos' : 'Añadir a Favoritos'}
                </MenuItem>
                <ListDivider />
                <MenuItem onClick={(event) => { event.stopPropagation(); onClearChat?.(); }}><ListItemDecorator sx={{ color: 'inherit' }}><Eraser style={{ fontSize: 18 }} /></ListItemDecorator> Vaciar chat</MenuItem>
                <MenuItem onClick={(event) => { event.stopPropagation(); onLeaveRequest(); }}><ListItemDecorator sx={{ color: 'inherit' }}><LogOut style={{ fontSize: 18 }} /></ListItemDecorator> Eliminar grupo</MenuItem>
            </Menu>
        </Dropdown>
    </Box>
    );
};
