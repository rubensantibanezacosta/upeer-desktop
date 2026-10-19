import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GroupInfoPanel } from '../../../src/components/layout/GroupInfoPanel.js';
import { useChatActionsStore } from '../../../src/store/useChatActionsStore.js';

describe('GroupInfoPanel', () => {
    beforeEach(() => {
        useChatActionsStore.setState({ groupPrefs: {} });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('muestra el grupo, sus miembros y el rol de administrador', () => {
        render(
            <GroupInfoPanel
                group={{ groupId: 'group-1', name: 'Peña', adminUpeerId: 'self', members: ['self', 'peer'], status: 'active' }}
                contacts={[{ upeerId: 'peer', address: 'peer-address', name: 'David', status: 'connected' }]}
                currentUserId="self"
                onClose={vi.fn()}
                onInviteMembers={vi.fn()}
            />,
        );

        expect(screen.getByText('Info. del grupo')).toBeDefined();
        expect(screen.getByText('Peña')).toBeDefined();
        expect(screen.getByText('Grupo · 2 miembros')).toBeDefined();
        expect(screen.getByText('Tú')).toBeDefined();
        expect(screen.getByText('David')).toBeDefined();
        expect(screen.getByText('Admin. del grupo')).toBeDefined();
        expect(screen.getByRole('button', { name: 'Añadir' })).toBeDefined();
    });

    it('expone llamadas de voz, vídeo y búsqueda para el grupo', () => {
        const onCallAudio = vi.fn();
        const onCallVideo = vi.fn();
        const onSearch = vi.fn();
        render(
            <GroupInfoPanel
                group={{ groupId: 'group-1', name: 'Peña', adminUpeerId: 'self', members: ['self', 'peer'], status: 'active' }}
                contacts={[]}
                currentUserId="self"
                onClose={vi.fn()}
                onInviteMembers={vi.fn()}
                onCallAudio={onCallAudio}
                onCallVideo={onCallVideo}
                onSearch={onSearch}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Llamar al grupo' }));
        fireEvent.click(screen.getByRole('button', { name: 'Videollamar al grupo' }));
        fireEvent.click(screen.getByRole('button', { name: 'Buscar en el chat' }));

        expect(onCallAudio).toHaveBeenCalledOnce();
        expect(onCallVideo).toHaveBeenCalledOnce();
        expect(onSearch).toHaveBeenCalledOnce();
    });

    it('cierra el panel y no muestra la acción de invitar a miembros si no eres administrador', () => {
        const onClose = vi.fn();

        render(
            <GroupInfoPanel
                group={{ groupId: 'group-1', name: 'Peña', adminUpeerId: 'peer', members: ['self', 'peer'], status: 'active' }}
                contacts={[]}
                currentUserId="self"
                onClose={onClose}
                onInviteMembers={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Cerrar info del grupo' }));

        expect(onClose).toHaveBeenCalledOnce();
        expect(screen.queryByRole('button', { name: 'Añadir' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Hacer admin a peer…' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Expulsar a peer…' })).toBeNull();
        expect(screen.getByText('peer…')).toBeDefined();
    });

    it('permite al administrador transferir el rol y expulsar miembros tras confirmar', () => {
        const onTransferAdmin = vi.fn();
        const onRemoveMember = vi.fn();
        render(
            <GroupInfoPanel
                group={{ groupId: 'group-1', name: 'Peña', adminUpeerId: 'self', members: ['self', 'peer'], status: 'active' }}
                contacts={[{ upeerId: 'peer', address: 'peer-address', name: 'David', status: 'connected' }]}
                currentUserId="self"
                onClose={vi.fn()}
                onInviteMembers={vi.fn()}
                onTransferAdmin={onTransferAdmin}
                onRemoveMember={onRemoveMember}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Hacer admin a David' }));
        fireEvent.click(screen.getByRole('button', { name: 'Transferir administración' }));
        expect(onTransferAdmin).toHaveBeenCalledWith('peer');

        fireEvent.click(screen.getByRole('button', { name: 'Expulsar a David' }));
        fireEvent.click(screen.getByRole('button', { name: 'Expulsar del grupo' }));
        expect(onRemoveMember).toHaveBeenCalledWith('peer');
    });

    it('silencia el grupo y conecta favoritos, multimedia, vaciado y salida con confirmación', () => {
        const onFavorite = vi.fn();
        const onClearChat = vi.fn();
        const onLeaveGroup = vi.fn();
        const onOpenMedia = vi.fn();
        render(
            <GroupInfoPanel
                group={{ groupId: 'group-1', name: 'Peña', adminUpeerId: 'self', members: ['self'], status: 'active' }}
                contacts={[]}
                currentUserId="self"
                sharedMedia={[{ fileId: 'file-1', fileName: 'foto.png', mimeType: 'image/png', url: '/foto.png', preview: '' }]}
                onClose={vi.fn()}
                onInviteMembers={vi.fn()}
                onOpenMedia={onOpenMedia}
                onFavorite={onFavorite}
                onClearChat={onClearChat}
                onLeaveGroup={onLeaveGroup}
            />,
        );

        fireEvent.click(screen.getByText('Silenciar notificaciones'));
        expect(useChatActionsStore.getState().groupPrefs['group-1'].muted).toBe(true);

        fireEvent.click(screen.getByText('Añadir a Favoritos'));
        expect(onFavorite).toHaveBeenCalledOnce();

        fireEvent.click(screen.getByRole('button', { name: 'Abrir multimedia compartida' }));
        const mediaTile = screen.getByLabelText('Abrir multimedia foto.png');
        expect(mediaTile).toBeDefined();
        fireEvent.click(mediaTile);
        expect(onOpenMedia).toHaveBeenCalledWith({ url: '/foto.png', name: 'foto.png', mimeType: 'image/png', fileId: 'file-1' });

        fireEvent.click(screen.getByRole('button', { name: 'Volver desde multimedia' }));
        fireEvent.click(screen.getByText('Vaciar chat'));
        fireEvent.click(screen.getByText('Vaciar historial'));
        expect(onClearChat).toHaveBeenCalledOnce();

        fireEvent.click(screen.getByText('Salir del grupo'));
        fireEvent.click(screen.getByText('Salir del grupo', { selector: 'button' }));
        expect(onLeaveGroup).toHaveBeenCalledOnce();
    });
});