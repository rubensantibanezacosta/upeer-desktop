import React, { useState } from 'react';
import { Dropdown, IconButton, ListDivider, ListItemDecorator, Menu, MenuButton, MenuItem, Tooltip } from '@mui/joy';
import { Ban, Bell, BellOff, Download, Eraser, Heart, Info, LogOut, MoreVertical, Palette, Search, Timer, Trash2, X } from 'lucide-react';
import { useChatActionsStore } from '../../store/useChatActionsStore.js';
import { useAppearanceStore } from '../../store/useAppearanceStore.js';
import { retentionFor, useChatRetentionStore } from '../../store/chatRetentionStore.js';
import { retentionLabel } from '../../utils/retention.js';
import { ConfirmActionDialog } from '../ui/ConfirmActionDialog.js';
import { ChatStylePicker } from '../../features/chat/style/ChatStylePicker.js';
import { TemporaryMessagesPicker } from '../../features/chat/retention/TemporaryMessagesPicker.js';

type PendingAction = 'clear' | 'delete' | 'leave' | 'block';

interface ChatHeaderMenuProps {
    kind: 'contact' | 'group';
    chatId: string;
    name: string;
    isFavorite: boolean;
    blocked?: boolean;
    onOpenInfo: () => void;
    onSearch: () => void;
    onToggleFavorite: () => void;
    onExport: () => void;
    onCloseChat: () => void;
    onClearChat: () => void;
    onDeleteChat?: () => void;
    onLeaveGroup?: () => void;
    onBlock?: () => void;
}

const itemIcon = (icon: React.ReactNode) => <ListItemDecorator sx={{ color: 'inherit' }}>{icon}</ListItemDecorator>;

interface ActionCopy {
    title: string;
    description: string;
    detail: string;
    confirmLabel: string;
    color: 'danger' | 'warning';
}

const buildActions = (kind: 'contact' | 'group'): Record<PendingAction, ActionCopy> => ({
    clear: {
        title: 'Vaciar chat',
        description: 'Se borrarán todos los mensajes de esta conversación.',
        detail: kind === 'group'
            ? 'El grupo sigue en tu lista con su nombre y sus miembros. Esta acción no se puede deshacer.'
            : 'El contacto sigue en tu lista. Esta acción no se puede deshacer.',
        confirmLabel: 'Vaciar chat',
        color: 'warning',
    },
    delete: {
        title: 'Eliminar chat',
        description: 'Se borrarán la conversación y el contacto de tu lista.',
        detail: 'Si vuelves a conectar con esta persona tendrás que añadirla otra vez.',
        confirmLabel: 'Eliminar chat',
        color: 'danger',
    },
    leave: {
        title: 'Salir del grupo',
        description: 'Dejarás de recibir los mensajes de este grupo.',
        detail: 'Necesitarás que alguien te invite de nuevo para volver.',
        confirmLabel: 'Salir del grupo',
        color: 'danger',
    },
    block: {
        title: 'Bloquear contacto',
        description: 'No podrá enviarte mensajes ni solicitudes de contacto.',
        detail: 'Puedes desbloquearlo cuando quieras desde Ajustes, Bloqueados.',
        confirmLabel: 'Bloquear',
        color: 'danger',
    },
});

export const ChatHeaderMenu: React.FC<ChatHeaderMenuProps> = ({
    kind,
    chatId,
    name,
    isFavorite,
    blocked = false,
    onOpenInfo,
    onSearch,
    onToggleFavorite,
    onExport,
    onCloseChat,
    onClearChat,
    onDeleteChat,
    onLeaveGroup,
    onBlock,
}) => {
    const contactPrefs = useChatActionsStore((state) => state.contactPrefs[chatId]);
    const groupPrefs = useChatActionsStore((state) => state.groupPrefs[chatId]);
    const toggleContact = useChatActionsStore((state) => state.toggleContact);
    const toggleGroup = useChatActionsStore((state) => state.toggleGroup);
    const chatStyle = useAppearanceStore((state) => state.chatStyles[chatId]);
    const setChatStyle = useAppearanceStore((state) => state.setChatStyle);
    const retention = useChatRetentionStore((state) => retentionFor(state.map, chatId));
    const setRetention = useChatRetentionStore((state) => state.setRetention);
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [styleOpen, setStyleOpen] = useState(false);
    const [retentionOpen, setRetentionOpen] = useState(false);
    const muted = (kind === 'contact' ? contactPrefs?.muted : groupPrefs?.muted) ?? false;

    const toggleMuted = () => {
        if (kind === 'contact') {
            toggleContact(chatId, 'muted');
            return;
        }
        toggleGroup(chatId, 'muted');
    };

    const runPending = () => {
        const action = pending;
        setPending(null);
        if (action === 'clear') onClearChat();
        if (action === 'delete') onDeleteChat?.();
        if (action === 'leave') onLeaveGroup?.();
        if (action === 'block') onBlock?.();
    };

    const pendingConfig = pending ? buildActions(kind)[pending] : null;

    return (
        <>
            <Dropdown>
                <Tooltip title="Opciones del chat" variant="soft">
                    <MenuButton
                        slots={{ root: IconButton }}
                        slotProps={{ root: { variant: 'plain', color: 'neutral', size: 'md', 'aria-label': `Opciones del chat con ${name}` } }}
                    >
                        <MoreVertical style={{ fontSize: 22 }} />
                    </MenuButton>
                </Tooltip>
                <Menu placement="bottom-end" size="sm" sx={{ minWidth: 248, borderRadius: 'lg', '--ListItem-radius': '8px', boxShadow: 'lg', zIndex: 1200 }}>
                    <MenuItem onClick={onOpenInfo}>
                        {itemIcon(<Info style={{ fontSize: 18 }} />)}
                        {kind === 'group' ? 'Info. del grupo' : 'Info. del contacto'}
                    </MenuItem>
                    <MenuItem onClick={onSearch}>
                        {itemIcon(<Search style={{ fontSize: 18 }} />)}
                        Buscar
                    </MenuItem>
                    <ListDivider />
                    <MenuItem onClick={toggleMuted}>
                        {itemIcon(muted ? <Bell style={{ fontSize: 18 }} /> : <BellOff style={{ fontSize: 18 }} />)}
                        {muted ? 'Reactivar notificaciones' : 'Silenciar notificaciones'}
                    </MenuItem>
                    <MenuItem onClick={onToggleFavorite}>
                        {itemIcon(<Heart style={{ fontSize: 18 }} fill={isFavorite ? 'currentColor' : 'none'} />)}
                        {isFavorite ? 'Quitar de Favoritos' : 'Añadir a Favoritos'}
                    </MenuItem>
                    <MenuItem onClick={onExport}>
                        {itemIcon(<Download style={{ fontSize: 18 }} />)}
                        Exportar chat
                    </MenuItem>
                    <MenuItem onClick={() => setStyleOpen(true)}>
                        {itemIcon(<Palette style={{ fontSize: 18 }} />)}
                        Estilo del chat
                    </MenuItem>
                    <MenuItem onClick={() => setRetentionOpen(true)}>
                        {itemIcon(<Timer style={{ fontSize: 18 }} />)}
                        {retention === 'off' ? 'Mensajes temporales' : `Mensajes temporales · ${retentionLabel(retention)}`}
                    </MenuItem>
                    <ListDivider />
                    <MenuItem onClick={onCloseChat}>
                        {itemIcon(<X style={{ fontSize: 18 }} />)}
                        Cerrar chat
                    </MenuItem>
                    {kind === 'contact' && !blocked && onBlock && (
                        <MenuItem onClick={() => setPending('block')}>
                            {itemIcon(<Ban style={{ fontSize: 18 }} />)}
                            Bloquear
                        </MenuItem>
                    )}
                    <MenuItem onClick={() => setPending('clear')}>
                        {itemIcon(<Eraser style={{ fontSize: 18 }} />)}
                        Vaciar chat
                    </MenuItem>
                    {kind === 'contact' ? (
                        <MenuItem onClick={() => setPending('delete')} sx={{ color: 'danger.plainColor' }}>
                            {itemIcon(<Trash2 style={{ fontSize: 18 }} />)}
                            Eliminar chat
                        </MenuItem>
                    ) : (
                        <MenuItem onClick={() => setPending('leave')} sx={{ color: 'danger.plainColor' }}>
                            {itemIcon(<LogOut style={{ fontSize: 18 }} />)}
                            Salir del grupo
                        </MenuItem>
                    )}
                </Menu>
            </Dropdown>

            {pendingConfig && (
                <ConfirmActionDialog
                    open
                    title={pendingConfig.title}
                    description={pendingConfig.description}
                    detail={pendingConfig.detail}
                    confirmLabel={pendingConfig.confirmLabel}
                    color={pendingConfig.color}
                    onCancel={() => setPending(null)}
                    onConfirm={runPending}
                />
            )}

            <ChatStylePicker
                open={styleOpen}
                value={chatStyle}
                onSelect={(id) => {
                    setChatStyle(chatId, id);
                    setStyleOpen(false);
                }}
                onClose={() => setStyleOpen(false)}
            />

            <TemporaryMessagesPicker
                open={retentionOpen}
                value={retention}
                onSelect={(id) => {
                    setRetentionOpen(false);
                    void setRetention(chatId, id);
                }}
                onClose={() => setRetentionOpen(false)}
            />
        </>
    );
};
