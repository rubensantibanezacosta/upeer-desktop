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

        useCallStore.getState().setStarted('call-1', 'peer-1', 'video');
        render(<CallsPanel contacts={contacts} groups={groups} selfUpeerId="self-id" onStartCall={onStartCall} />);

        expect(screen.getAllByText('Ana')).toHaveLength(2);
        expect(screen.getByText('Equipo')).toBeDefined();
        expect(screen.getByText('Videollamada · Llamando')).toBeDefined();
        expect(screen.getByRole('button', { name: 'Llamar a Ana' })).toBeDisabled();
        expect(screen.queryByRole('button', { name: 'Llamar a Tú' })).toBeNull();

        cleanup();
        useCallStore.getState().reset();
        render(<CallsPanel contacts={contacts} groups={groups} selfUpeerId="self-id" onStartCall={onStartCall} />);
        screen.getByRole('button', { name: 'Llamar al grupo Equipo' }).click();
        expect(onStartCall).toHaveBeenCalledWith('group-1', 'audio', true, ['peer-1'], 'group-1');
    });
});