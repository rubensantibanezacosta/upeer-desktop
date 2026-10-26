import React, { useState } from 'react';
import { Box, Dropdown, IconButton, ListDivider, ListItemDecorator, Menu, MenuButton, MenuItem, Tooltip, Typography } from '@mui/joy';
import { ArrowLeft, CheckCheck, Lock, LogOut, MessageSquarePlus, MoreVertical, Users } from 'lucide-react';
import { LIST_ROW_MIN_HEIGHT } from './listRowMetrics.js';
import { SignOutFlow } from '../ui/settings/SignOutFlow.js';
import { useChatActionsStore } from '../../store/useChatActionsStore.js';

interface SidebarHeaderProps {
    onAddNew: () => void;
    onCreateGroup?: () => void;
    onOpenAppLock?: () => void;
}

const itemIcon = (icon: React.ReactNode) => <ListItemDecorator sx={{ color: 'inherit' }}>{icon}</ListItemDecorator>;

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ onAddNew, onCreateGroup, onOpenAppLock }) => {
    const markAllRead = useChatActionsStore((state) => state.markAllRead);
    const [signOutOpen, setSignOutOpen] = useState(false);

    return (
        <Box sx={{
            p: 2, pt: 2.5,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: 'background.surface',
            height: LIST_ROW_MIN_HEIGHT, boxSizing: 'border-box',
        }}>
            <Typography level="h4" sx={{ fontWeight: 600 }}>uPeer</Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Tooltip title="Nueva conversación" variant="soft">
                    <IconButton aria-label="Nuevo chat" size="sm" variant="plain" color="neutral" onClick={onAddNew}>
                        <MessageSquarePlus style={{ fontSize: 21 }} />
                    </IconButton>
                </Tooltip>
                <Dropdown>
                    <Tooltip title="Opciones de chats" variant="soft">
                        <MenuButton
                            slots={{ root: IconButton }}
                            slotProps={{ root: { variant: 'plain', color: 'neutral', size: 'sm', 'aria-label': 'Más opciones' } }}
                        >
                            <MoreVertical style={{ fontSize: 20 }} />
                        </MenuButton>
                    </Tooltip>
                    <Menu placement="bottom-end" size="sm" sx={{ minWidth: 236, borderRadius: 'lg', '--ListItem-radius': '8px', boxShadow: 'lg' }}>
                        {onCreateGroup && (
                            <MenuItem onClick={onCreateGroup}>
                                {itemIcon(<Users style={{ fontSize: 18 }} />)}
                                Nuevo grupo
                            </MenuItem>
                        )}
                        <MenuItem onClick={markAllRead}>
                            {itemIcon(<CheckCheck style={{ fontSize: 18 }} />)}
                            Marcar todos como leídos
                        </MenuItem>
                        <ListDivider />
                        {onOpenAppLock && (
                            <MenuItem onClick={onOpenAppLock}>
                                {itemIcon(<Lock style={{ fontSize: 18 }} />)}
                                Bloqueo de aplicación
                            </MenuItem>
                        )}
                        <MenuItem onClick={() => setSignOutOpen(true)} sx={{ color: 'danger.plainColor' }}>
                            {itemIcon(<LogOut style={{ fontSize: 18 }} />)}
                            Cerrar sesión
                        </MenuItem>
                    </Menu>
                </Dropdown>
            </Box>
            <SignOutFlow open={signOutOpen} onClose={() => setSignOutOpen(false)} />
        </Box>
    );
};

export const NewChatHeader: React.FC<{ onBack: () => void }> = ({ onBack }) => (
    <Box sx={{
        px: 2, display: 'flex', alignItems: 'center', gap: 1.5,
        backgroundColor: 'background.surface',
        height: LIST_ROW_MIN_HEIGHT, boxSizing: 'border-box',
    }}>
        <IconButton aria-label="Volver" size="sm" variant="plain" color="neutral" onClick={onBack}>
            <ArrowLeft style={{ fontSize: 20 }} />
        </IconButton>
        <Typography level="h4" sx={{ fontWeight: 600 }}>Nuevo chat</Typography>
    </Box>
);
