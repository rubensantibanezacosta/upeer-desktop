import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { Group } from '../../../src/types/chat.js';

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
vi.mock('@mui/icons-material/Done', () => ({ default: () => <div data-testid="DoneIcon" /> }));
vi.mock('@mui/icons-material/DoneAll', () => ({ default: () => <div data-testid="DoneAllIcon" /> }));
vi.mock('@mui/icons-material/Mic', () => ({ default: () => <div data-testid="MicIcon" /> }));
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

    it('shows DoneIcon when last message is mine and status is sent', () => {
        const groupWithAck = { ...mockGroup, lastMessageIsMine: true, lastMessageStatus: 'sent' };
        render(<GroupItem {...defaultProps} group={groupWithAck} />);
        expect(screen.getByTestId('DoneIcon')).toBeDefined();
    });

    it('shows DoneAllIcon when last message is mine and status is delivered', () => {
        const groupWithAck = { ...mockGroup, lastMessageIsMine: true, lastMessageStatus: 'delivered' };
        render(<GroupItem {...defaultProps} group={groupWithAck} />);
        expect(screen.getByTestId('DoneAllIcon')).toBeDefined();
    });

    it('does not show ack icon when last message is not mine', () => {
        const groupWithAck = { ...mockGroup, lastMessageIsMine: false, lastMessageStatus: 'delivered' };
        render(<GroupItem {...defaultProps} group={groupWithAck} />);
        expect(screen.queryByTestId('DoneIcon')).toBeNull();
        expect(screen.queryByTestId('DoneAllIcon')).toBeNull();
    });

    it('opens leave group modal', async () => {
        render(<GroupItem {...defaultProps} />);

        const icon = screen.getByTestId('KeyboardArrowDownIcon');
        const optionsBtn = icon.parentElement as HTMLElement;
        fireEvent.click(optionsBtn);

        const leaveItem = screen.getByText('Eliminar grupo');
        fireEvent.click(leaveItem);

        expect(screen.getByText(/¿Estás seguro de que quieres eliminar el grupo/i)).toBeDefined();
    });
});
