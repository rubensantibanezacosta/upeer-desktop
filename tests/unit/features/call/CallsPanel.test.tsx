import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contact, Group } from '../../../../src/types/chat.js';
vi.mock('../../../../src/features/call/useCallMedia.js', () => ({
    useCallMedia: () => ({
        setOnRemoteFrame: vi.fn(),
        localStream: null,
        startScreenShare: vi.fn(),
        stopScreenShare: vi.fn(),
        screenSharing: false,
        setVideoEnabled: vi.fn(),
        setAudioEnabled: vi.fn(),
    }),
}));
import { CallsPanel } from '../../../../src/features/call/CallsPanel.js';
import { useCallStore } from '../../../../src/features/call/useCallStore.js';

describe('CallsPanel', () => {
    const originalUpeer = window.upeer;

    beforeEach(() => {
        Object.defineProperty(window, 'upeer', { configurable: true, value: { ...originalUpeer, getMessages: vi.fn().mockResolvedValue([]) } });
    });
    afterEach(() => {
        cleanup();
        useCallStore.getState().reset();
        Object.defineProperty(window, 'upeer', { configurable: true, value: originalUpeer });
    });

    it('renders active calls instead of recent calls while a call is active', async () => {
        const contacts: Contact[] = [{
            upeerId: 'peer-1',
            address: 'peer-address',
            name: 'Ana',
            status: 'connected',
        }];
        const groups: Group[] = [{
            groupId: 'group-1',
            name: 'Equipo',
            adminUpeerId: 'peer-1',
            members: ['peer-1'],
            status: 'active',
        }];
        window.upeer.getMessages = vi.fn().mockResolvedValue([]);

        useCallStore.getState().setStarted('call-1', 'peer-1', 'video');
        render(<CallsPanel contacts={contacts} groups={groups} />);

        expect(screen.getByText('Ana')).toBeDefined();
        expect(screen.getByText('Videollamada · Llamando')).toBeDefined();
        expect(screen.queryByText('Llamadas recientes')).toBeNull();
        expect(window.upeer.getMessages).not.toHaveBeenCalled();
    });

    it('renders recent calls with participants, time and duration when there is no active call', async () => {
        const contacts: Contact[] = [{ upeerId: 'peer-1', address: 'peer-address', name: 'Ana', alias: 'Anita', status: 'connected' }];
        const groups: Group[] = [];
        window.upeer.getMessages = vi.fn().mockResolvedValue([{
            id: 'call-event', chatUpeerId: 'peer-1', isMine: true, message: '__SYS__|Videollamada · 02:15 · 1710000000000', status: 'sent', timestamp: 1710000000000,
        }]);

        render(<CallsPanel contacts={contacts} groups={groups} />);

        await waitFor(() => expect(screen.getByText('Anita')).toBeDefined());
        expect(screen.getByText('Videollamada')).toBeDefined();
        expect(screen.getByText('02:15')).toBeDefined();
        expect(screen.getByText(new Date(1710000000000).toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' · ' + new Date(1710000000000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))).toBeDefined();
        expect(screen.queryByText('Contactos')).toBeNull();
    });
});