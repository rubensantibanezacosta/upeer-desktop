import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncBlockingOverlay } from '../../../../src/components/layout/SyncBlockingOverlay.js';
import { useChatStore } from '../../../../src/store/useChatStore.js';

const initialSyncStatus = useChatStore.getState().syncStatus;

const baseStatus: UpeerSyncStatus = {
    state: 'synced',
    phase: 'live',
    devicesTotal: 2,
    devicesDone: 2,
    lastPeerAt: 1,
    ageMillis: 1,
    pendingEvents: 0,
    pendingEntityIds: [],
    peers: [],
    devices: [],
};

const setSyncStatus = (status: Partial<UpeerSyncStatus>) => {
    useChatStore.setState({ syncStatus: { ...baseStatus, ...status } });
};

describe('SyncBlockingOverlay', () => {
    afterEach(() => {
        vi.useRealTimers();
        useChatStore.setState({ syncStatus: initialSyncStatus });
    });

    it('no tapa nada cuando la sincronización está al día', () => {
        setSyncStatus({ phase: 'live' });
        render(<SyncBlockingOverlay enabled />);
        expect(screen.queryByTestId('sync-blocking-overlay')).toBeNull();
    });

    it('no tapa nada cuando no hay otros dispositivos', () => {
        setSyncStatus({ phase: 'idle', devicesTotal: 0, devicesDone: 0 });
        render(<SyncBlockingOverlay enabled />);
        expect(screen.queryByTestId('sync-blocking-overlay')).toBeNull();
    });

    it('tapa la pantalla durante la fase masiva y muestra el progreso', () => {
        setSyncStatus({ state: 'pending', phase: 'syncing', devicesTotal: 3, devicesDone: 1 });
        render(<SyncBlockingOverlay enabled />);
        expect(screen.getByTestId('sync-blocking-overlay')).toBeTruthy();
        expect(screen.getByText('Sincronizando tus dispositivos…')).toBeTruthy();
        expect(screen.getByText('1 de 3 dispositivo(s) al día. Los chats aparecerán en cuanto termine.')).toBeTruthy();
    });

    it('no se muestra mientras la app está bloqueada o arrancando', () => {
        setSyncStatus({ phase: 'syncing', devicesTotal: 2, devicesDone: 0 });
        render(<SyncBlockingOverlay enabled={false} />);
        expect(screen.queryByTestId('sync-blocking-overlay')).toBeNull();
    });

    it('confirma el final y se retira sola', () => {
        vi.useFakeTimers();
        setSyncStatus({ state: 'pending', phase: 'syncing', devicesTotal: 2, devicesDone: 1 });
        render(<SyncBlockingOverlay enabled />);
        expect(screen.getByText('Sincronizando tus dispositivos…')).toBeTruthy();

        act(() => {
            setSyncStatus({ phase: 'live', devicesDone: 2 });
        });
        expect(screen.getByText('¡Al día!')).toBeTruthy();

        act(() => {
            vi.advanceTimersByTime(2_000);
        });
        expect(screen.queryByTestId('sync-blocking-overlay')).toBeNull();
    });
});
