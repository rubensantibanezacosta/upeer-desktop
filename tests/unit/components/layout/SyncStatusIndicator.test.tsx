import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SyncStatusIndicator } from '../../../../src/components/layout/SyncStatusIndicator.js';
import { useChatStore } from '../../../../src/store/useChatStore.js';

const initialSyncStatus = useChatStore.getState().syncStatus;

const setSyncStatus = (status: UpeerSyncStatus) => {
    useChatStore.setState({ syncStatus: status });
};

describe('SyncStatusIndicator', () => {
    afterEach(() => {
        setSyncStatus(initialSyncStatus);
    });

    it('reports no devices when the account registry is empty', () => {
        setSyncStatus({ state: 'disabled', pendingEvents: 0, pendingEntityIds: [], peers: [], devices: [] });
        render(<SyncStatusIndicator />);
        expect(screen.getByLabelText('Sin dispositivos en la cuenta')).toBeTruthy();
    });

    it('counts this device when it is the only one in the account', () => {
        setSyncStatus({
            state: 'disabled',
            pendingEvents: 0,
            pendingEntityIds: [],
            peers: [],
            devices: [{ deviceId: 'a'.repeat(64), platform: 'desktop', state: 'local', lastSeen: null }],
        });
        render(<SyncStatusIndicator />);
        expect(screen.getByLabelText('1 dispositivo en tu cuenta, 1 conectado')).toBeTruthy();
        expect(screen.getByText('1')).toBeTruthy();
    });

    it('counts every device of the account, local included', () => {
        setSyncStatus({
            state: 'synced',
            pendingEvents: 0,
            pendingEntityIds: [],
            peers: [{ deviceId: 'b'.repeat(64), state: 'synced', ackSequence: 9, lastSeen: 1 }],
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
            pendingEvents: 2,
            pendingEntityIds: ['m1'],
            peers: [{ deviceId: 'b'.repeat(64), state: 'pending', ackSequence: 3, lastSeen: 1 }],
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
});
