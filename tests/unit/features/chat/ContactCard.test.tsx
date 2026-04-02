import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { ChatStore } from '../../../../src/store/chatStoreTypes.js';
import type { Contact, MyIdentity } from '../../../../src/types/chat.js';

const refreshContacts = vi.fn(async () => undefined);
const setTargetUpeerId = vi.fn();

type ContactCardStore = Pick<ChatStore, 'contacts' | 'myIdentity' | 'refreshContacts' | 'setTargetUpeerId'>;

let mockState: ContactCardStore;

vi.mock('../../../../src/store/useChatStore.js', () => ({
    useChatStore: <T,>(selector: (state: ContactCardStore) => T) => selector(mockState),
}));

vi.mock('@mui/icons-material/PersonAdd', () => ({
    default: () => <div data-testid="person-add-icon" />,
}));

vi.mock('qrcode.react', () => ({
    QRCodeSVG: () => <div data-testid="qr-code" />,
}));

import { ContactCard } from '../../../../src/features/chat/ContactCard.js';

describe('ContactCard', () => {
    const myIdentity: MyIdentity = {
        upeerId: 'self-peer',
        address: '300::self',
        publicKey: 'self-pk',
        alias: 'Yo',
        avatar: null,
    };

    const existingContact: Contact = {
        upeerId: 'peer-123',
        address: '300::1',
        name: 'Alice',
        status: 'connected',
        publicKey: 'pk-1',
    };

    beforeEach(() => {
        refreshContacts.mockClear();
        setTargetUpeerId.mockClear();
        mockState = {
            contacts: [],
            myIdentity,
            refreshContacts,
            setTargetUpeerId,
        };
        Object.defineProperty(window, 'upeer', {
            configurable: true,
            value: {
                addContact: vi.fn(async () => ({ success: true, upeerId: 'peer-123' })),
            },
        });
    });

    it('disables the action when the card is your own identity', () => {
        render(<ContactCard name="Yo" address="300::self" upeerId="self-peer" isMe={false} />);

        const button = screen.getByRole('button', { name: 'Eres tú' }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
    });

    it('disables the action when the contact is already saved', () => {
        mockState = {
            ...mockState,
            contacts: [existingContact],
        };

        render(<ContactCard name="Alice" address="300::1" upeerId="peer-123" isMe={false} />);

        const button = screen.getByRole('button', { name: 'Ya guardado' }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
    });

    it('saves the contact and refreshes the store', async () => {
        render(<ContactCard name="Alice" address="300::1" upeerId="peer-123" isMe={false} />);

        fireEvent.click(screen.getByRole('button', { name: 'Guardar contacto' }));

        await waitFor(() => {
            expect(window.upeer.addContact).toHaveBeenCalledWith('peer-123@300::1', 'Alice');
        });
        await waitFor(() => {
            expect(refreshContacts).toHaveBeenCalledTimes(1);
            expect(setTargetUpeerId).toHaveBeenCalledWith('peer-123');
        });
    });

    it('shows the backend error when saving fails', async () => {
        Object.defineProperty(window, 'upeer', {
            configurable: true,
            value: {
                addContact: vi.fn(async () => ({ success: false, error: 'Contacto bloqueado' })),
            },
        });

        render(<ContactCard name="Alice" address="300::1" upeerId="peer-123" isMe={false} />);

        fireEvent.click(screen.getByRole('button', { name: 'Guardar contacto' }));

        expect(await screen.findByText('Contacto bloqueado')).toBeDefined();
        expect(refreshContacts).not.toHaveBeenCalled();
    });
});
