import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { Group } from '../../../src/types/chat.js';

vi.mock('lucide-react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('lucide-react')>()),
    Users: () => <div data-testid="UsersIcon" />,
    ChevronDown: () => <div data-testid="ChevronDownIcon" />,
    Check: () => <div data-testid="CheckIcon" />,
    CheckCheck: () => <div data-testid="CheckCheckIcon" />,
}));
vi.mock('../../../src/utils/fileIcons.js', () => ({ getFileIcon: () => <div data-testid="FileIcon" /> }));

import { GroupItem } from '../../../src/components/layout/GroupItem.js';

describe('GroupItem Component', () => {
    const mockGroup: Group = {
        groupId: 'g1',
        name: 'Dev Team',
        adminUpeerId: 'u1',
        members: ['u1', 'u2', 'u3'],
        status: 'active',
        lastMessage: 'Meeting at 5',
        lastMessageTime: new Date().toISOString(),
        avatar: null
    };

    const defaultProps = {
        group: mockGroup,
        isSelected: false,
        onSelect: vi.fn(),
        onToggleFavorite: vi.fn(),
        onLeaveGroup: vi.fn(),
    };

    it('renders group name and last message', () => {
        render(<GroupItem {...defaultProps} />);
        expect(screen.getByText('Dev Team')).toBeDefined();
        expect(screen.getByText('Meeting at 5')).toBeDefined();
    });

    it('shows member count if no last message', () => {
        const groupNoMsg = { ...mockGroup, lastMessage: undefined };
        render(<GroupItem {...defaultProps} group={groupNoMsg} />);
        expect(screen.getByText('3 miembros')).toBeDefined();
    });

    it('calls onSelect when clicked', () => {
        render(<GroupItem {...defaultProps} />);
        const button = screen.getByRole('button');
        fireEvent.click(button);
        expect(defaultProps.onSelect).toHaveBeenCalledWith('g1');
    });

    it('renders Users icon when no avatar is provided', () => {
        render(<GroupItem {...defaultProps} />);
        expect(screen.getByTestId('UsersIcon')).toBeDefined();
    });

    it('shows CheckIcon when last message is mine and status is sent', () => {
        const groupWithAck = { ...mockGroup, lastMessageIsMine: true, lastMessageStatus: 'sent' };
        render(<GroupItem {...defaultProps} group={groupWithAck} />);
        expect(screen.getByTestId('CheckIcon')).toBeDefined();
    });

    it('shows CheckCheckIcon when last message is mine and status is delivered', () => {
        const groupWithAck = { ...mockGroup, lastMessageIsMine: true, lastMessageStatus: 'delivered' };
        render(<GroupItem {...defaultProps} group={groupWithAck} />);
        expect(screen.getByTestId('CheckCheckIcon')).toBeDefined();
    });

    it('does not show ack icon when last message is not mine', () => {
        const groupWithAck = { ...mockGroup, lastMessageIsMine: false, lastMessageStatus: 'delivered' };
        render(<GroupItem {...defaultProps} group={groupWithAck} />);
        expect(screen.queryByTestId('CheckIcon')).toBeNull();
        expect(screen.queryByTestId('CheckCheckIcon')).toBeNull();
    });

    it('opens leave group modal', async () => {
        render(<GroupItem {...defaultProps} />);

        const icon = screen.getByTestId('ChevronDownIcon');
        const optionsBtn = icon.parentElement as HTMLElement;
        fireEvent.click(optionsBtn);

        const leaveItem = screen.getByText('Eliminar grupo');
        fireEvent.click(leaveItem);

        expect(screen.getByText(/¿Estás seguro de que quieres eliminar el grupo/i)).toBeDefined();
    });
});
