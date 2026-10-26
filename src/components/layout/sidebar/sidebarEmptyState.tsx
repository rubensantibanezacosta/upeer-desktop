import React from 'react';
import { MessageSquare, Users, BellOff, SearchX, Star } from 'lucide-react';
import { EmptyState } from './EmptyState.js';
import { LoadingState } from './LoadingState.js';
import type { SidebarFilter } from '../../../store/useNavigationStore.js';

export interface SidebarEmptyStateAction {
    label: string;
    onClick: () => void;
}

interface SidebarEmptyStateCopy {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    action?: SidebarEmptyStateAction;
}

export type SidebarEmptyStateModel =
    | { kind: 'loading'; label: string }
    | ({ kind: 'empty' } & SidebarEmptyStateCopy);

export interface SidebarEmptyStateInput {
    filter: SidebarFilter;
    loading: boolean;
    search: string;
    visibleCount: number;
    sourceCount: number;
    onOpenNew: () => void;
    onCreateGroup?: () => void;
    onShowAll: () => void;
    onClearSearch: () => void;
}

const LOADING_LABEL = 'Cargando conversaciones…';

const filterCopy = (filter: SidebarFilter, input: SidebarEmptyStateInput): SidebarEmptyStateCopy => {
    switch (filter) {
        case 'groups':
            return {
                icon: <Users style={{ fontSize: 'inherit' }} />,
                title: 'Sin grupos',
                subtitle: 'Crea un grupo para hablar con varias personas a la vez.',
                action: input.onCreateGroup
                    ? { label: 'Crear grupo', onClick: input.onCreateGroup }
                    : { label: 'Ver todos los chats', onClick: input.onShowAll },
            };
        case 'unread':
            return {
                icon: <BellOff style={{ fontSize: 'inherit' }} />,
                title: 'Sin mensajes no leídos',
                subtitle: 'Estás al día. Aquí aparecerán los chats con mensajes nuevos.',
                action: { label: 'Ver todos los chats', onClick: input.onShowAll },
            };
        case 'favorites':
            return {
                icon: <Star style={{ fontSize: 'inherit' }} />,
                title: 'Sin favoritos',
                subtitle: 'Marca contactos o grupos como favoritos para encontrarlos rápidamente aquí.',
                action: { label: 'Ver todos los chats', onClick: input.onShowAll },
            };
        default:
            return {
                icon: <MessageSquare style={{ fontSize: 'inherit' }} />,
                title: 'Sin conversaciones',
                subtitle: 'Añade un contacto para empezar a chatear de forma segura.',
                action: { label: 'Nueva conversación', onClick: input.onOpenNew },
            };
    }
};

export const resolveSidebarEmptyState = (input: SidebarEmptyStateInput): SidebarEmptyStateModel | null => {
    const term = input.search.trim();
    if (input.visibleCount > 0) return null;
    if (input.loading) return { kind: 'loading', label: LOADING_LABEL };
    if (term && input.sourceCount > 0) {
        return {
            kind: 'empty',
            icon: <SearchX style={{ fontSize: 'inherit' }} />,
            title: 'Sin coincidencias',
            subtitle: `Ninguna conversación coincide con "${term}".`,
            action: { label: 'Limpiar búsqueda', onClick: input.onClearSearch },
        };
    }
    return { kind: 'empty', ...filterCopy(input.filter, input) };
};

export const SidebarEmptyStateView: React.FC<{ model: SidebarEmptyStateModel }> = ({ model }) => (
    model.kind === 'loading'
        ? <LoadingState label={model.label} />
        : <EmptyState icon={model.icon} title={model.title} subtitle={model.subtitle} action={model.action} />
);
