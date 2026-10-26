import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Los iconos se mockean para poder afirmar sobre ellos sin depender de Lucide
vi.mock('lucide-react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('lucide-react')>()),
    MessageCircle: () => <div data-testid="MessageCircleIcon" />,
    CircleDashed: () => <div data-testid="CircleDashedIcon" />,
    Users: () => <div data-testid="UsersIcon" />,
    Settings: () => <div data-testid="SettingsIcon" />,
    Phone: () => <div data-testid="PhoneIcon" />,
    Video: () => <div data-testid="VideoIcon" />,
}));

import { NavigationRail } from '../../../src/components/layout/NavigationRail';

describe('NavigationRail Component', () => {
    const defaultProps = {
        myIp: '127.0.0.1',
        myInitial: 'R',
        activeView: 'chat' as const
    };

    it('renders navigation icons', () => {
        render(<NavigationRail {...defaultProps} />);
        expect(screen.getByTestId('MessageCircleIcon')).toBeDefined();
        expect(screen.getByTestId('SettingsIcon')).toBeDefined();
        expect(screen.getByTestId('PhoneIcon')).toBeDefined();
    });

    it('muestra la cantidad de chats sin leer en el badge', () => {
        render(<NavigationRail {...defaultProps} unreadChatCount={4} />);
        expect(screen.getByRole('button', { name: 'Chats, 4 sin leer' })).toBeDefined();
        expect(screen.getByText('4')).toBeDefined();
    });

    it('limita el badge a 99+', () => {
        render(<NavigationRail {...defaultProps} unreadChatCount={120} />);
        expect(screen.getByText('99+')).toBeDefined();
    });

    it('calls onOpenCalls when the calls item is clicked', () => {
        const onOpenCalls = vi.fn();
        render(<NavigationRail {...defaultProps} onOpenCalls={onOpenCalls} />);
        fireEvent.click(screen.getByRole('button', { name: 'Llamadas' }));
        expect(onOpenCalls).toHaveBeenCalledTimes(1);
    });

    it('muestra el icono de voz cuando hay una llamada de audio activa', () => {
        render(<NavigationRail {...defaultProps} activeCallKind="audio" />);
        expect(screen.getByRole('button', { name: 'Llamadas' }).querySelector('[data-testid="PhoneIcon"]')).not.toBeNull();
    });

    it('muestra el icono de vídeo cuando hay una videollamada activa', () => {
        render(<NavigationRail {...defaultProps} activeCallKind="video" />);
        expect(screen.getByRole('button', { name: 'Llamadas' }).querySelector('[data-testid="VideoIcon"]')).not.toBeNull();
    });

    it('muestra el icono habitual cuando no hay llamadas activas', () => {
        render(<NavigationRail {...defaultProps} />);
        expect(screen.getByRole('button', { name: 'Llamadas' }).querySelector('[data-testid="PhoneIcon"]')).not.toBeNull();
        expect(screen.queryByTestId('VideoIcon')).toBeNull();
    });

    it('calls onOpenSettings when settings icon is clicked', () => {
        const onOpenSettings = vi.fn();
        render(<NavigationRail {...defaultProps} onOpenSettings={onOpenSettings} />);

        const settingsButton = screen.getByLabelText('Ajustes');
        fireEvent.click(settingsButton);

        expect(onOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('calls onOpenIdentity when avatar is clicked', () => {
        const onOpenIdentity = vi.fn();
        render(<NavigationRail {...defaultProps} onOpenIdentity={onOpenIdentity} />);

        const avatar = screen.getByText('R');
        fireEvent.click(avatar);

        expect(onOpenIdentity).toHaveBeenCalledTimes(1);
    });

    it('shows current initial if no avatar is provided', () => {
        render(<NavigationRail {...defaultProps} myInitial="JD" />);
        expect(screen.getByText('JD')).toBeDefined();
    });

    it('highlights active view', () => {
        const { rerender } = render(<NavigationRail {...defaultProps} activeView="chat" />);
        const chatButton = screen.getByTestId('MessageCircleIcon').closest('button');
        expect(chatButton).not.toBeNull();
        expect(chatButton!.className).toContain('MuiIconButton-variantSoft');

        rerender(<NavigationRail {...defaultProps} activeView="settings" />);
        const settingsButton = screen.getByTestId('SettingsIcon').closest('button');
        expect(settingsButton).not.toBeNull();
        expect(settingsButton!.className).toContain('MuiIconButton-variantSoft');
    });
});
