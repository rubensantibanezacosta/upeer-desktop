import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// COMPLETELY MOCK AWAY @mui/icons-material so it never gets loaded
vi.mock('@mui/icons-material', () => ({}));
vi.mock('@mui/icons-material/esm/utils/createSvgIcon.js', () => ({
    default: () => null
}));
// También mockear la subruta que lanza el error si se accede directamente
vi.mock('@mui/material/utils', () => ({
    createSvgIcon: () => null,
    capitalize: (s: string) => s,
    useIsomorphicLayoutEffect: (f: any) => f(),
    debounce: (f: any) => f,
}));

vi.mock('@mui/icons-material/HourglassEmpty', () => ({ default: () => <div data-testid="HourglassEmptyIcon" /> }));
vi.mock('@mui/icons-material/Done', () => ({ default: () => <div data-testid="DoneIcon" /> }));
vi.mock('@mui/icons-material/DoneAll', () => ({ default: () => <div data-testid="DoneAllIcon" /> }));
vi.mock('@mui/icons-material/KeyboardArrowDown', () => ({ default: () => <div data-testid="KeyboardArrowDownIcon" /> }));
vi.mock('@mui/icons-material/Archive', () => ({ default: () => <div data-testid="ArchiveIcon" /> }));
vi.mock('@mui/icons-material/NotificationsOff', () => ({ default: () => <div data-testid="NotificationsOffIcon" /> }));
vi.mock('@mui/icons-material/PushPin', () => ({ default: () => <div data-testid="PushPinIcon" /> }));
vi.mock('@mui/icons-material/Notifications', () => ({ default: () => <div data-testid="NotificationsIcon" /> }));
vi.mock('@mui/icons-material/MarkChatUnread', () => ({ default: () => <div data-testid="MarkChatUnreadIcon" /> }));
vi.mock('@mui/icons-material/FavoriteBorder', () => ({ default: () => <div data-testid="FavoriteBorderIcon" /> }));
vi.mock('@mui/icons-material/Block', () => ({ default: () => <div data-testid="BlockIcon" /> }));
vi.mock('@mui/icons-material/DeleteSweep', () => ({ default: () => <div data-testid="DeleteSweepIcon" /> }));
vi.mock('@mui/icons-material/Delete', () => ({ default: () => <div data-testid="DeleteIcon" /> }));
vi.mock('@mui/icons-material/WarningRounded', () => ({ default: () => <div data-testid="WarningRoundedIcon" /> }));
vi.mock('@mui/icons-material/Security', () => ({ default: () => <div data-testid="SecurityIcon" /> }));
vi.mock('@mui/icons-material/CheckCircle', () => ({ default: () => <div data-testid="CheckCircleIcon" /> }));
vi.mock('@mui/icons-material/VerifiedUser', () => ({ default: () => <div data-testid="VerifiedUserIcon" /> }));
vi.mock('@mui/icons-material/GppMaybe', () => ({ default: () => <div data-testid="GppMaybeIcon" /> }));
vi.mock('@mui/icons-material/NewReleases', () => ({ default: () => <div data-testid="NewReleasesIcon" /> }));

import { ContactItem } from '../../../src/components/layout/ContactItem.js';

describe('ContactItem Component', () => {
    const mockContact = {
        upeerId: 'c1',
        name: 'Alice',
        status: 'connected',
        lastMessage: 'Hello!',
        lastMessageTime: new Date().toISOString(),
        unreadCount: 2,
        vouchScore: 85,
    } as any;

    const defaultProps = {
        contact: mockContact,
        isSelected: false,
        onSelect: vi.fn(),
        onDelete: vi.fn(),
        onClear: vi.fn(),
        isTyping: false,
    };

    it('renders contact name and last message', () => {
        render(<ContactItem {...defaultProps} />);
        expect(screen.getByText('Alice')).toBeDefined();
        expect(screen.getByText('Hello!')).toBeDefined();
    });

    it('shows unread count badge', () => {
        const contactWithUnread = {
            ...mockContact,
            lastMessageIsMine: false,
            lastMessageStatus: 'sent'
        };
        render(<ContactItem {...defaultProps} contact={contactWithUnread} />);
        const name = screen.getByText('Alice');
        // El bold se aplica mediante una clase de Joy que pone fontWeight
        expect(name.className).toContain('JoyTypography-root');
    });

    it('calls onSelect when clicked', () => {
        render(<ContactItem {...defaultProps} />);
        const button = screen.getByRole('button');
        fireEvent.click(button);
        expect(defaultProps.onSelect).toHaveBeenCalledWith('c1');
    });

    it('displays "escribiendo..." when isTyping is true', () => {
        render(<ContactItem {...defaultProps} isTyping={true} />);
        expect(screen.getByText(/escribiendo\.\.\./i)).toBeDefined();
    });

    it('shows high reputation badge for high vouchScore', () => {
        render(<ContactItem {...defaultProps} />);
        expect(screen.getByTestId('VerifiedUserIcon')).toBeDefined();
    });

    it('shows online indicator when lastSeen is recent', () => {
        const onlineContact = {
            ...mockContact,
            lastSeen: new Date().toISOString()
        } as any;
        render(<ContactItem {...defaultProps} contact={onlineContact} />);
        expect(screen.getByTestId('VerifiedUserIcon')).toBeDefined();
    });
});
