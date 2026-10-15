import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    afterEach(() => {
        cleanup();
        useCallStore.getState().reset();
    });

    it('renders available contacts, groups and active calls without an unstable store snapshot', () => {
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
        const onStartCall = vi.fn().mockResolvedValue({ success: true });
        const onToggleMute = vi.fn().mockResolvedValue(undefined);
        const onToggleCamera = vi.fn().mockResolvedValue(undefined);
        const onEndCall = vi.fn().mockResolvedValue(undefined);

        useCallStore.getState().setStarted('call-1', 'peer-1', 'video');
        render(<CallsPanel contacts={contacts} groups={groups} selfUpeerId="self-id" onStartCall={onStartCall} onToggleMute={onToggleMute} onToggleCamera={onToggleCamera} onEndCall={onEndCall} />);

        expect(screen.getAllByText('Ana')).toHaveLength(3);
        expect(screen.getByText('Equipo')).toBeDefined();
        expect(screen.getByText('Videollamada · Llamando')).toBeDefined();
        expect(screen.getByRole('button', { name: 'Llamar a Ana' })).toBeDisabled();
        expect(screen.queryByRole('button', { name: 'Llamar a Tú' })).toBeNull();
    });
});