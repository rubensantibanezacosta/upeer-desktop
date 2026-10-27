import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncBlockingOverlay } from '../../../../src/components/layout/SyncBlockingOverlay.js';
import { useChatStore } from '../../../../src/store/useChatStore.js';

const initialSyncStatus = useChatStore.getState().syncStatus;

const baseProgress: UpeerSyncProgress = {
    determinate: false,
    percent: 0,
    historyDone: 0,
    historyTotal: 0,
    historyKnown: false,
    pendingOutbound: 0,
    pendingInbound: 0,
    pendingFiles: 0,
    headline: 'Sincronizando tus dispositivos…',
    detail: 'Conectando con tus dispositivos',
};

const baseStatus: UpeerSyncStatus = {
    state: 'synced',
    phase: 'live',
    devicesTotal: 2,
    devicesDone: 2,
    lastPeerAt: 1,
    ageMillis: 1,
    pendingEvents: 0,
    pendingMessages: 0,
    pendingMetadata: 0,
    pendingEntityIds: [],
    peers: [],
    devices: [],
    progress: baseProgress,
};

const setSyncStatus = (status: Partial<UpeerSyncStatus>, progress: Partial<UpeerSyncProgress> = {}) => {
    useChatStore.setState({
        syncStatus: { ...baseStatus, ...status, progress: { ...baseProgress, ...progress } },
    });
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

    it('muestra los mensajes que lleva contados cuando hay total conocido', () => {
        setSyncStatus({ state: 'pending', phase: 'syncing' }, {
            determinate: true,
            percent: 25,
            historyDone: 25,
            historyTotal: 100,
            historyKnown: true,
            detail: '25 de 100 mensajes',
        });
        render(<SyncBlockingOverlay enabled />);
        expect(screen.getByTestId('sync-blocking-overlay')).toBeTruthy();
        expect(screen.getByText('Sincronizando tus dispositivos…')).toBeTruthy();
        expect(screen.getByText('25 de 100 mensajes. Los chats aparecerán en cuanto termine.')).toBeTruthy();
    });

    it('no inventa porcentaje cuando el par aún no dice cuánto falta', () => {
        setSyncStatus({ state: 'pending', phase: 'syncing' }, {
            determinate: false,
            detail: '12 mensajes sincronizados · 2 archivos en curso',
        });
        render(<SyncBlockingOverlay enabled />);
        expect(screen.getByText('12 mensajes sincronizados · 2 archivos en curso. Los chats aparecerán en cuanto termine.')).toBeTruthy();
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
