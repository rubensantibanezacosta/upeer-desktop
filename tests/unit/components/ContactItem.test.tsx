import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { Contact } from '../../../src/types/chat.js';

vi.mock('lucide-react', async (importOriginal) => ({
    ...(await importOriginal<typeof import('lucide-react')>()),
    BadgeCheck: () => <div data-testid="BadgeCheckIcon" />,
}));

import { ContactItem } from '../../../src/components/layout/ContactItem.js';

describe('ContactItem Component', () => {
    const mockContact: Contact = {
        upeerId: 'c1',
        address: 'addr-1',
        name: 'Alice',
        status: 'connected',
        publicKey: 'pk-1',
        lastMessage: 'Hello!',
        lastMessageTime: new Date().toISOString(),
        vouchScore: 85,
    };

    const defaultProps = {
        contact: mockContact,
        isSelected: false,
        onSelect: vi.fn(),
        onToggleFavorite: vi.fn(),
        onClear: vi.fn(),
        isTyping: false,
    };

    it('renders contact name and last message', () => {
        render(<ContactItem {...defaultProps} />);
        expect(screen.getByText('Alice')).toBeDefined();
        expect(screen.getByText('Hello!')).toBeDefined();
    });

    it('shows call event preview without the internal system prefix', () => {
        render(<ContactItem {...defaultProps} contact={{ ...mockContact, lastMessage: '__SYS__|Videollamada · 00:27' }} />);

        expect(screen.getByText('Videollamada · 00:27')).toBeDefined();
        expect(screen.queryByText('__SYS__|Videollamada · 00:27')).toBeNull();
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
        expect(screen.getByTestId('BadgeCheckIcon')).toBeDefined();
    });

    it('shows online indicator when lastSeen is recent', () => {
        const onlineContact: Contact = {
            ...mockContact,
            lastSeen: new Date().toISOString()
        };
        render(<ContactItem {...defaultProps} contact={onlineContact} />);
        expect(screen.getByTestId('BadgeCheckIcon')).toBeDefined();
    });
});
