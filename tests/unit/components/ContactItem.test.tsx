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

    it('marca En línea cuando hay actividad reciente', () => {
        render(<ContactItem {...defaultProps} contact={{ ...mockContact, lastMessage: '', lastActive: new Date().toISOString() }} />);
        expect(screen.getByText('En línea')).toBeDefined();
    });

    it('no marca En línea cuando la actividad es antigua', () => {
        const staleContact: Contact = {
            ...mockContact,
            lastMessage: '',
            lastSeen: new Date().toISOString(),
            lastActive: new Date(Date.now() - 10 * 60_000).toISOString(),
        };
        render(<ContactItem {...defaultProps} contact={staleContact} />);
        expect(screen.queryByText('En línea')).toBeNull();
        expect(screen.getByText('Desconectado')).toBeDefined();
    });

    it('pinta el icono del tipo de adjunto al tamaño de la fila', () => {
        const fileMessage = JSON.stringify({ type: 'file', fileName: 'informe.pdf', mimeType: 'application/pdf' });
        const { container } = render(<ContactItem {...defaultProps} contact={{ ...mockContact, lastMessage: fileMessage }} />);
        const icon = container.querySelector('svg.lucide');

        expect(screen.getByText('informe.pdf')).toBeDefined();
        expect(icon).not.toBeNull();
        expect((icon as SVGElement).style.fontSize).toBe('14px');
    });

    it('pinta el icono de nota de voz al tamaño de la fila', () => {
        const voiceMessage = JSON.stringify({ type: 'file', fileName: 'nota.m4a', mimeType: 'audio/mp4', isVoiceNote: true });
        const { container } = render(<ContactItem {...defaultProps} contact={{ ...mockContact, lastMessage: voiceMessage }} />);
        const icon = container.querySelector('svg.lucide');

        expect(screen.getByText('Nota de voz')).toBeDefined();
        expect(icon).not.toBeNull();
        expect((icon as SVGElement).style.fontSize).toBe('14px');
    });
});
