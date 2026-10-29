import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatHeaderMenu } from '../../../src/components/layout/ChatHeaderMenu.js';

const noop = () => undefined;

function renderMenu(overrides: Partial<React.ComponentProps<typeof ChatHeaderMenu>> = {}) {
    render(
        <ChatHeaderMenu
            kind="contact"
            chatId={'a'.repeat(64)}
            name="Ana"
            isFavorite={false}
            onOpenInfo={noop}
            onSearch={noop}
            onToggleFavorite={noop}
            onExport={noop}
            onCloseChat={noop}
            onClearChat={noop}
            onDeleteChat={noop}
            onBlock={noop}
            {...overrides}
        />
    );
    fireEvent.click(screen.getByRole('button', { name: /Opciones del chat/ }));
}

describe('ChatHeaderMenu', () => {
    it('ofrece bloquear y eliminar en un contacto normal', () => {
        renderMenu();

        expect(screen.getByRole('menuitem', { name: 'Bloquear' })).toBeDefined();
        expect(screen.getByRole('menuitem', { name: 'Eliminar chat' })).toBeDefined();
        expect(screen.getByRole('menuitem', { name: 'Añadir a Favoritos' })).toBeDefined();
    });

    it('no ofrece acciones imposibles contra uno mismo', () => {
        const onBlock = vi.fn();
        const onDeleteChat = vi.fn();
        const onToggleFavorite = vi.fn();
        renderMenu({ isSelfChat: true, name: 'Rubén', onBlock, onDeleteChat, onToggleFavorite });

        expect(screen.queryByRole('menuitem', { name: 'Bloquear' })).toBeNull();
        expect(screen.queryByRole('menuitem', { name: 'Eliminar chat' })).toBeNull();
        expect(screen.queryByRole('menuitem', { name: 'Añadir a Favoritos' })).toBeNull();
        expect(screen.getByRole('menuitem', { name: 'Vaciar chat' })).toBeDefined();
        expect(screen.getByRole('menuitem', { name: 'Cerrar chat' })).toBeDefined();
    });

    it('llama a la info de la cuenta cuando el chat es propio', () => {
        const onOpenInfo = vi.fn();
        renderMenu({ isSelfChat: true, name: 'Rubén', onOpenInfo });

        fireEvent.click(screen.getByRole('menuitem', { name: 'Info. de tu cuenta' }));

        expect(onOpenInfo).toHaveBeenCalledTimes(1);
    });

    it('sigue mostrando los ajustes del chat en la conversación propia', () => {
        renderMenu({ isSelfChat: true, name: 'Rubén' });

        expect(screen.getByRole('menuitem', { name: 'Silenciar notificaciones' })).toBeDefined();
        expect(screen.getByRole('menuitem', { name: 'Estilo del chat' })).toBeDefined();
        expect(screen.getByRole('menuitem', { name: 'Exportar chat' })).toBeDefined();
    });

    it('mantiene salir del grupo en un grupo', () => {
        renderMenu({ kind: 'group', chatId: 'grp-1', name: 'Equipo' });

        expect(screen.getByRole('menuitem', { name: 'Salir del grupo' })).toBeDefined();
        expect(screen.queryByRole('menuitem', { name: 'Eliminar chat' })).toBeNull();
    });
});
