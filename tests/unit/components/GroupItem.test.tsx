import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock de iconos de MUI para evitar dependencias de @mui/material
vi.mock('@mui/icons-material', () => ({}));
vi.mock('@mui/icons-material/esm/utils/createSvgIcon.js', () => ({ default: () => null }));
vi.mock('@mui/icons-material/Groups', () => ({ default: () => <div data-testid="GroupsIcon" /> }));
vi.mock('@mui/icons-material/KeyboardArrowDown', () => ({ default: () => <div data-testid="KeyboardArrowDownIcon" /> }));
vi.mock('@mui/icons-material/Archive', () => ({ default: () => <div data-testid="ArchiveIcon" /> }));
vi.mock('@mui/icons-material/NotificationsOff', () => ({ default: () => <div data-testid="NotificationsOffIcon" /> }));
vi.mock('@mui/icons-material/PushPin', () => ({ default: () => <div data-testid="PushPinIcon" /> }));
vi.mock('@mui/icons-material/MarkChatUnread', () => ({ default: () => <div data-testid="MarkChatUnreadIcon" /> }));
vi.mock('@mui/icons-material/FavoriteBorder', () => ({ default: () => <div data-testid="FavoriteBorderIcon" /> }));
vi.mock('@mui/icons-material/DeleteSweep', () => ({ default: () => <div data-testid="DeleteSweepIcon" /> }));
vi.mock('@mui/icons-material/ExitToApp', () => ({ default: () => <div data-testid="ExitToAppIcon" /> }));
vi.mock('@mui/icons-material/WarningRounded', () => ({ default: () => <div data-testid="WarningRoundedIcon" /> }));

import { GroupItem } from '../../../src/components/layout/GroupItem.js';

describe('GroupItem Component', () => {
    const mockGroup = {
        groupId: 'g1',
        name: 'Dev Team',
        members: ['u1', 'u2', 'u3'],
        lastMessage: 'Meeting at 5',
        lastMessageTime: new Date().toISOString(),
        avatar: null
    } as any;

    const defaultProps = {
        group: mockGroup,
        isSelected: false,
        onSelect: vi.fn(),
        onLeaveGroup: vi.fn(),
    };

    it('renders group name and last message', () => {
        render(<GroupItem {...defaultProps} />);
        expect(screen.getByText('Dev Team')).toBeDefined();
        expect(screen.getByText('Meeting at 5')).toBeDefined();
    });

    it('shows member count if no last message', () => {
        const groupNoMsg = { ...mockGroup, lastMessage: null };
        render(<GroupItem {...defaultProps} group={groupNoMsg} />);
        expect(screen.getByText('3 miembros')).toBeDefined();
    });

    it('calls onSelect when clicked', () => {
        render(<GroupItem {...defaultProps} />);
        const button = screen.getByRole('button');
        fireEvent.click(button);
        expect(defaultProps.onSelect).toHaveBeenCalledWith('g1');
    });

    it('renders Groups icon when no avatar is provided', () => {
        render(<GroupItem {...defaultProps} />);
        expect(screen.getByTestId('GroupsIcon')).toBeDefined();
    });

    it('opens leave group modal', async () => {
        render(<GroupItem {...defaultProps} />);

        // El botón tiene el data-testid del icono KeyboardArrowDownIcon dentro
        const icon = screen.getByTestId('KeyboardArrowDownIcon');
        const optionsBtn = icon.parentElement as HTMLElement;
        fireEvent.click(optionsBtn);

        // Buscar el ítem del menú de eliminar
        const leaveItem = screen.getByText('Eliminar grupo');
        fireEvent.click(leaveItem);

        // Verificar que aparece el diálogo de confirmación
        expect(screen.getByText(/¿Estás seguro de que quieres eliminar el grupo/i)).toBeDefined();
    });
});
