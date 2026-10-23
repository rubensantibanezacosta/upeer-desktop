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

    it('shows that this is the only device', () => {
        setSyncStatus({ state: 'disabled', pendingEvents: 0, pendingEntityIds: [], peers: [] });
        render(<SyncStatusIndicator />);
        expect(screen.getByLabelText('Estado de sincronización: Sin otros dispositivos')).toBeTruthy();
    });

    it('shows a pending state while events are not acknowledged', () => {
        setSyncStatus({
            state: 'pending',
            pendingEvents: 2,
            pendingEntityIds: ['m1'],
            peers: [{ deviceId: 'a'.repeat(64), state: 'pending', ackSequence: 3, lastSeen: 1 }],
        });
        render(<SyncStatusIndicator />);
        expect(screen.getByLabelText('Estado de sincronización: Sincronizando')).toBeTruthy();
    });

    it('shows a synced state once every device acknowledged', () => {
        setSyncStatus({
            state: 'synced',
            pendingEvents: 0,
            pendingEntityIds: [],
            peers: [{ deviceId: 'a'.repeat(64), state: 'synced', ackSequence: 9, lastSeen: 1 }],
        });
        render(<SyncStatusIndicator />);
        expect(screen.getByLabelText('Estado de sincronización: Sincronizado')).toBeTruthy();
    });
});
