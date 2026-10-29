import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSyncStatusView } from '../../../src/main_process/network/sync/statusView.js';
import { getMyAccountRegistry } from '../../../src/main_process/network/accountRegistry.js';
import { getDeviceIdentity } from '../../../src/main_process/security/deviceIdentity.js';
import { getSyncStatus } from '../../../src/main_process/storage/sync/status.js';
import { getMyUPeerId } from '../../../src/main_process/security/identity.js';
import { completeServedHistory, recordHistoryComplete, recordHistoryPage, recordHistoryServed, resetHistoryWork } from '../../../src/main_process/network/sync/historyProgress.js';
import { resetSyncProgressMemory } from '../../../src/main_process/network/sync/progress.js';

vi.mock('../../../src/main_process/security/identity.js', () => ({
    getMyUPeerId: vi.fn(() => 'a'.repeat(64)),
}));

vi.mock('../../../src/main_process/security/deviceIdentity.js', () => ({
    getDeviceIdentity: vi.fn(() => ({ deviceId: 'local-device' })),
}));

vi.mock('../../../src/main_process/network/accountRegistry.js', () => ({
    getMyAccountRegistry: vi.fn(),
}));

vi.mock('../../../src/main_process/storage/sync/status.js', () => ({
    getSyncStatus: vi.fn(),
}));

const accountDevice = (deviceId: string, platform = 'android') => ({
    deviceId,
    devicePublicKey: 'b'.repeat(64),
    platform,
    authorizedAt: 1,
    expiresAt: 2,
    epoch: 1,
});

describe('getSyncStatusView', () => {
    beforeEach(() => {
        vi.mocked(getMyUPeerId).mockReturnValue('a'.repeat(64));
        vi.mocked(getDeviceIdentity).mockReturnValue({ deviceId: 'local-device' } as never);
        vi.mocked(getSyncStatus).mockReturnValue({
            state: 'idle',
            pendingEvents: 0,
            pendingMessages: 0,
            pendingMetadata: 0,
            pendingEntityIds: [],
            peers: [],
        });
        vi.mocked(getMyAccountRegistry).mockReturnValue(null);
    });

    it('returns an empty view when there is no identity', () => {
        vi.mocked(getMyUPeerId).mockReturnValue('');
        expect(getSyncStatusView().devices).toEqual([]);
    });

    it('keeps the local device when the registry is empty', () => {
        const view = getSyncStatusView();
        expect(view.devices).toEqual([
            { deviceId: 'local-device', platform: 'desktop', state: 'local', lastSeen: null },
        ]);
    });

    it('marks the local device and reports online peers as synced', () => {
        vi.mocked(getMyAccountRegistry).mockReturnValue({
            devices: [accountDevice('local-device', 'desktop'), accountDevice('remote-device')],
        } as never);
        vi.mocked(getSyncStatus).mockReturnValue({
            state: 'synced',
            pendingEvents: 0,
            pendingMessages: 0,
            pendingMetadata: 0,
            pendingEntityIds: [],
            peers: [{ deviceId: 'remote-device', state: 'synced', ackSequence: 5, lastSeen: 42, historyCompleted: true }],
        });
        const view = getSyncStatusView();
        expect(view.devices).toEqual([
            { deviceId: 'local-device', platform: 'desktop', state: 'local', lastSeen: null },
            { deviceId: 'remote-device', platform: 'android', state: 'synced', lastSeen: 42 },
        ]);
    });

    it('reports devices without a peer record as offline', () => {
        vi.mocked(getMyAccountRegistry).mockReturnValue({
            devices: [accountDevice('local-device', 'desktop'), accountDevice('remote-device')],
        } as never);
        const view = getSyncStatusView();
        expect(view.devices[1]).toMatchObject({ deviceId: 'remote-device', state: 'offline', lastSeen: null });
    });

    it('does not duplicate the local device when the registry already lists it', () => {
        vi.mocked(getMyAccountRegistry).mockReturnValue({
            devices: [accountDevice('local-device', 'desktop')],
        } as never);
        expect(getSyncStatusView().devices).toHaveLength(1);
    });
});

describe('getSyncStatusView: pendientes por dirección', () => {
    beforeEach(() => {
        resetHistoryWork();
        resetSyncProgressMemory();
    });

    it('separa lo que falta por enviar de lo que falta por recibir', () => {
        vi.mocked(getMyUPeerId).mockReturnValue('a'.repeat(64));
        vi.mocked(getMyAccountRegistry).mockReturnValue(null);
        vi.mocked(getSyncStatus).mockReturnValue({
            state: 'pending',
            pendingEvents: 3,
            pendingMessages: 3,
            pendingMetadata: 0,
            pendingEntityIds: ['m1'],
            peers: [{ deviceId: 'remote-device', state: 'pending', ackSequence: 1, lastSeen: Date.now(), historyCompleted: false }],
        });
        recordHistoryPage('remote-device', 10, 40);

        const view = getSyncStatusView();

        expect(view.progress.pendingOutbound).toBe(3);
        expect(view.progress.pendingInbound).toBe(40);
        expect(view.progress.detail).toContain('3 mensajes por enviar');
        expect(view.progress.detail).toContain('40 mensajes por recibir');
    });

    it('no inventa entrantes cuando el par no anunció el total', () => {
        vi.mocked(getMyUPeerId).mockReturnValue('a'.repeat(64));
        vi.mocked(getMyAccountRegistry).mockReturnValue(null);
        vi.mocked(getSyncStatus).mockReturnValue({
            state: 'idle',
            pendingEvents: 0,
            pendingMessages: 0,
            pendingMetadata: 0,
            pendingEntityIds: [],
            peers: [],
        });

        expect(getSyncStatusView().progress.pendingInbound).toBe(0);
    });

    it('vuelve a marcar la sincronización en cuanto queda histórico por recibir', () => {
        vi.mocked(getMyUPeerId).mockReturnValue('a'.repeat(64));
        vi.mocked(getMyAccountRegistry).mockReturnValue(null);
        vi.mocked(getSyncStatus).mockReturnValue({
            state: 'synced',
            pendingEvents: 0,
            pendingMessages: 0,
            pendingMetadata: 0,
            pendingEntityIds: [],
            peers: [{ deviceId: 'remote-device', state: 'synced', ackSequence: 9, lastSeen: Date.now(), historyCompleted: true }],
        });
        recordHistoryPage('remote-device', 10, 40);

        const view = getSyncStatusView();

        expect(view.phase).toBe('syncing');
        expect(view.progress.headline).toBe('Sincronizando tus dispositivos…');
        expect(view.progress.percent).toBe(20);
    });

    it('no despierta la sincronización si el dispositivo lleva callado un minuto', () => {
        vi.mocked(getMyUPeerId).mockReturnValue('a'.repeat(64));
        vi.mocked(getMyAccountRegistry).mockReturnValue(null);
        vi.mocked(getSyncStatus).mockReturnValue({
            state: 'synced',
            pendingEvents: 0,
            pendingMessages: 0,
            pendingMetadata: 0,
            pendingEntityIds: [],
            peers: [{
                deviceId: 'remote-device',
                state: 'synced',
                ackSequence: 9,
                lastSeen: Date.now() - 60_000,
                historyCompleted: true,
            }],
        });
        recordHistoryPage('remote-device', 10, 40);

        expect(getSyncStatusView().phase).toBe('live');
    });

    it('da el histórico por terminado cuando el otro dispositivo ya lo recibió todo', () => {
        vi.mocked(getMyUPeerId).mockReturnValue('a'.repeat(64));
        vi.mocked(getMyAccountRegistry).mockReturnValue(null);
        vi.mocked(getSyncStatus).mockReturnValue({
            state: 'synced',
            pendingEvents: 0,
            pendingMessages: 0,
            pendingMetadata: 0,
            pendingEntityIds: [],
            peers: [{ deviceId: 'remote-device', state: 'synced', ackSequence: 9, lastSeen: Date.now(), historyCompleted: true }],
        });
        recordHistoryPage('remote-device', 10, 40);
        recordHistoryServed('remote-device', 30, 0);
        completeServedHistory('remote-device');
        recordHistoryComplete('remote-device');

        const view = getSyncStatusView();

        expect(view.phase).toBe('live');
        expect(view.progress.pendingInbound).toBe(0);
        expect(view.progress.percent).toBe(100);
    });

    it('deja de contar el progreso de un dispositivo que lleva dos minutos callado', () => {
        vi.useFakeTimers();
        try {
            vi.mocked(getMyUPeerId).mockReturnValue('a'.repeat(64));
            vi.mocked(getMyAccountRegistry).mockReturnValue(null);
            vi.mocked(getSyncStatus).mockReturnValue({
                state: 'idle',
                pendingEvents: 0,
                pendingMessages: 0,
                pendingMetadata: 0,
                pendingEntityIds: [],
                peers: [],
            });
            recordHistoryPage('remote-device', 10, 40);
            vi.advanceTimersByTime(121_000);

            expect(getSyncStatusView().progress.pendingInbound).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });
});
