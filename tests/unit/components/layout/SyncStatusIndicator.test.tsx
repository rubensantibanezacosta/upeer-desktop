import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SyncStatusIndicator, pendingLines } from '../../../../src/components/layout/SyncStatusIndicator.js';
import { useChatStore } from '../../../../src/store/useChatStore.js';

const initialSyncStatus = useChatStore.getState().syncStatus;

const baseStatus: UpeerSyncStatus = {
    state: 'idle',
    phase: 'idle',
    devicesTotal: 0,
    devicesDone: 0,
    lastPeerAt: 0,
    ageMillis: 0,
    pendingEvents: 0,
    pendingMessages: 0,
    pendingMetadata: 0,
    pendingEntityIds: [],
    peers: [],
    devices: [],
    progress: {
        determinate: false,
        percent: 0,
        historyDone: 0,
        historyTotal: 0,
        historyKnown: false,
        pendingOutbound: 0,
        pendingInbound: 0,
        pendingFiles: 0,
        headline: 'Sin dispositivos que sincronizar',
        detail: 'Este equipo es el único de la cuenta',
    },
};

const setSyncStatus = (status: Partial<UpeerSyncStatus>) => {
    useChatStore.setState({ syncStatus: { ...baseStatus, ...status } });
};

describe('SyncStatusIndicator', () => {
    afterEach(() => {
        useChatStore.setState({ syncStatus: initialSyncStatus });
    });

    it('reports no devices when the account registry is empty', () => {
        setSyncStatus({});
        render(<SyncStatusIndicator />);
        expect(screen.getByLabelText('Sin dispositivos en la cuenta')).toBeTruthy();
    });

    it('counts this device when it is the only one in the account', () => {
        setSyncStatus({
            devices: [{ deviceId: 'a'.repeat(64), platform: 'desktop', state: 'local', lastSeen: null }],
        });
        render(<SyncStatusIndicator />);
        expect(screen.getByLabelText('1 dispositivo en tu cuenta, 1 conectado')).toBeTruthy();
        expect(screen.getByText('1')).toBeTruthy();
    });

    it('counts every device of the account, local included', () => {
        setSyncStatus({
            state: 'synced',
            phase: 'live',
            devicesTotal: 1,
            devicesDone: 1,
            peers: [{ deviceId: 'b'.repeat(64), state: 'synced', ackSequence: 9, lastSeen: 1, historyCompleted: true }],
            devices: [
                { deviceId: 'a'.repeat(64), platform: 'desktop', state: 'local', lastSeen: null },
                { deviceId: 'b'.repeat(64), platform: 'android', state: 'synced', lastSeen: 1 },
            ],
        });
        render(<SyncStatusIndicator />);
        expect(screen.getByLabelText('2 dispositivos en tu cuenta, 2 conectados')).toBeTruthy();
        expect(screen.getByText('2')).toBeTruthy();
    });

    it('keeps offline devices in the total count', () => {
        setSyncStatus({
            state: 'pending',
            phase: 'live',
            devicesTotal: 1,
            devicesDone: 0,
            pendingEvents: 2,
            pendingEntityIds: ['m1'],
            peers: [{ deviceId: 'b'.repeat(64), state: 'pending', ackSequence: 3, lastSeen: 1, historyCompleted: false }],
            devices: [
                { deviceId: 'a'.repeat(64), platform: 'desktop', state: 'local', lastSeen: null },
                { deviceId: 'b'.repeat(64), platform: 'android', state: 'pending', lastSeen: 1 },
                { deviceId: 'c'.repeat(64), platform: 'android', state: 'offline', lastSeen: null },
            ],
        });
        render(<SyncStatusIndicator />);
        expect(screen.getByLabelText('3 dispositivos en tu cuenta, 1 conectado')).toBeTruthy();
        expect(screen.getByText('3')).toBeTruthy();
    });

    it('distingue los pendientes por dirección', () => {
        expect(pendingLines({
            ...baseStatus,
            pendingEvents: 2,
            progress: { ...baseStatus.progress, pendingOutbound: 2, pendingInbound: 30 },
        })).toEqual(['2 por enviar', '30 por recibir']);
    });

    it('no enseña una dirección cuando no hay pendientes', () => {
        expect(pendingLines(baseStatus)).toEqual([]);
    });
});
