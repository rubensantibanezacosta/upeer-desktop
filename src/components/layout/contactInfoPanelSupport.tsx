import React, { useMemo } from 'react';
import ArchiveIcon from '@mui/icons-material/Archive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import BlockIcon from '@mui/icons-material/Block';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import { parseMessage } from '../../features/chat/message/MessageItem.js';
import { toMediaUrl } from '../../utils/fileUtils.js';
import { ChatMessage, Contact } from '../../types/chat.js';
import { isMediaFile } from './contactInfoHelpers.js';
import { SharedMediaItem } from './ContactMediaStrip.js';

export interface ContactInfoUtilityAction {
    key: string;
    label: string;
    icon: React.ReactNode;
    onClick?: () => void;
    disabled: boolean;
}

export interface ContactInfoDangerAction {
    key: string;
    label: string;
    icon: React.ReactNode;
    color: string;
    onClick: () => void;
}

export const useSharedMediaItems = (chatHistory: ChatMessage[], activeTransfers: any[]) => useMemo(() => {
    return chatHistory
        .map((message) => {
            const { fileData } = parseMessage(message.message, message.isMine, activeTransfers);
            if (!fileData || !isMediaFile(fileData.mimeType, fileData.fileName, fileData.isVoiceNote)) {
                return null;
            }
            const preview = fileData.thumbnail
                ? (fileData.thumbnail.startsWith('data:') ? fileData.thumbnail : toMediaUrl(fileData.thumbnail))
                : (fileData.savedPath ? toMediaUrl(fileData.savedPath) : '');
            return {
                fileId: fileData.fileId,
                fileName: fileData.fileName,
                mimeType: fileData.mimeType,
                url: fileData.savedPath || '',
                preview,
            };
        })
        .filter((item): item is SharedMediaItem => !!item)
        .reverse();
}, [activeTransfers, chatHistory]);

interface ContactInfoActionsParams {
    contact: Contact;
    onShare: () => void;
    onArchive?: () => void;
    onMute?: () => void;
    onFavorite?: () => void;
    onClearChat: () => void;
    onBlockContact: () => void;
    onDeleteRequest: () => void;
}

export const buildContactInfoActions = ({
    contact,
    onShare,
    onArchive,
    onMute,
    onFavorite,
    onClearChat,
    onBlockContact,
    onDeleteRequest,
}: ContactInfoActionsParams) => {
    const utilityActions: ContactInfoUtilityAction[] = [
        {
            key: 'share',
            label: 'Compartir contacto',
            icon: <ShareOutlinedIcon sx={{ fontSize: 22 }} />,
            onClick: onShare,
            disabled: false,
        },
        {
            key: 'mute',
            label: 'Silenciar notificaciones',
            icon: <NotificationsOffIcon sx={{ fontSize: 22 }} />,
            onClick: onMute,
            disabled: !onMute,
        },
        {
            key: 'archive',
            label: 'Archivar chat',
            icon: <ArchiveIcon sx={{ fontSize: 22 }} />,
            onClick: onArchive,
            disabled: !onArchive,
        },
        {
            key: 'favorite',
            label: contact.isFavorite ? 'Quitar de Favoritos' : 'Añadir a Favoritos',
            icon: contact.isFavorite ? <FavoriteIcon sx={{ fontSize: 22 }} /> : <FavoriteBorderIcon sx={{ fontSize: 22 }} />,
            onClick: onFavorite,
            disabled: !onFavorite,
        },
    ];

    const dangerActions: ContactInfoDangerAction[] = [
        {
            key: 'clear',
            label: 'Vaciar chat',
            icon: <DeleteSweepIcon sx={{ fontSize: 22 }} />,
            color: 'warning.600',
            onClick: onClearChat,
        },
        {
            key: 'block',
            label: contact.status === 'blocked' ? 'Desbloquear' : `Bloquear a ${contact.name}`,
            icon: contact.status === 'blocked' ? <LockOpenIcon sx={{ fontSize: 22 }} /> : <BlockIcon sx={{ fontSize: 22 }} />,
            color: 'danger.600',
            onClick: onBlockContact,
        },
        {
            key: 'delete',
            label: 'Eliminar contacto',
            icon: <PersonRemoveIcon sx={{ fontSize: 22 }} />,
            color: 'danger.600',
            onClick: onDeleteRequest,
        },
    ];

    return { utilityActions, dangerActions };
};

interface SlidingPanelViewProps {
    active: boolean;
    direction: 'left' | 'right';
    zIndex?: number;
    backgroundColor?: string;
    children: React.ReactNode;
}

export const SlidingPanelView: React.FC<SlidingPanelViewProps> = ({ active, direction, zIndex, backgroundColor, children }) => {
    const hiddenTransform = direction === 'left' ? 'translateX(-100%)' : 'translateX(100%)';
    return (
        <Box
            sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                backgroundColor,
                transform: active ? 'translateX(0)' : hiddenTransform,
                transition: 'transform 0.25s ease-in-out',
                visibility: active ? 'visible' : 'hidden',
                zIndex,
            }}
        >
            {children}
        </Box>
    );
};