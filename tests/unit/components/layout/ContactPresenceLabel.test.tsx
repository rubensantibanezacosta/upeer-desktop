import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ContactPresenceLabel } from '../../../../src/components/layout/ContactPresenceLabel.js';
import type { Contact } from '../../../../src/types/chat.js';

const privacy = { onlineStatus: true, lastSeen: true };

vi.mock('../../../../src/store/usePrivacyStore.js', () => ({
    usePrivacyStore: <T,>(selector: (value: typeof privacy) => T) => selector(privacy),
}));

const contact = (overrides: Partial<Contact> = {}): Contact => ({
    upeerId: 'peer-1',
    name: 'Ana',
    address: '200:aaaa::1',
    status: 'connected',
    ...overrides,
});

const secondsAgo = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

describe('ContactPresenceLabel', () => {
    beforeEach(() => {
        privacy.onlineStatus = true;
        privacy.lastSeen = true;
    });

    it('pinta en línea con actividad humana reciente', () => {
        render(<ContactPresenceLabel contact={contact({ lastActive: secondsAgo(5) })} />);
        expect(screen.getByText('En línea')).toBeDefined();
    });

    it('no pinta en línea por alcanzabilidad: status connected sin actividad queda desconectado', () => {
        render(<ContactPresenceLabel contact={contact({ status: 'connected', lastSeen: secondsAgo(1) })} />);
        expect(screen.queryByText('En línea')).toBeNull();
        expect(screen.getByText('Desconectado')).toBeDefined();
    });

    it('deja de estar en línea pasada la ventana', () => {
        render(<ContactPresenceLabel contact={contact({ lastActive: secondsAgo(90) })} />);
        expect(screen.getByText('Desconectado')).toBeDefined();
    });

    it('marca los bloqueados aunque tengan actividad', () => {
        render(<ContactPresenceLabel contact={contact({ status: 'blocked', lastActive: secondsAgo(5) })} />);
        expect(screen.getByText('Bloqueado')).toBeDefined();
    });

    it('no muestra nada si el usuario oculta su conexión', () => {
        privacy.onlineStatus = false;
        const { container } = render(<ContactPresenceLabel contact={contact({ lastActive: secondsAgo(5) })} />);
        expect(screen.queryByText('En línea')).toBeNull();
        expect(screen.queryByText('Desconectado')).toBeNull();
        expect(container.textContent).toBe('');
    });
});
