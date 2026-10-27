import { getMyUPeerId } from '../../security/identity.js';
import { getDeviceIdentity } from '../../security/deviceIdentity.js';
import { getMyAccountRegistry } from '../accountRegistry.js';
import { getSyncStatus, type SyncStatus } from '../../storage/sync/status.js';
import { computeSyncPhase, type SyncPhase } from './phase.js';
import { getHistoryWork } from './historyProgress.js';
import { trackSyncProgress, type SyncProgressView } from './progress.js';

export type SyncDeviceState = 'local' | 'synced' | 'pending' | 'offline';

export type SyncDeviceView = {
    deviceId: string;
    platform: string;
    state: SyncDeviceState;
    lastSeen: number | null;
};

export type SyncStatusView = SyncStatus & {
    phase: SyncPhase;
    devicesTotal: number;
    devicesDone: number;
    lastPeerAt: number;
    ageMillis: number;
    devices: SyncDeviceView[];
    progress: SyncProgressView;
};

export type SyncStatusExtras = {
    activeFiles?: number;
};

const IDLE_PROGRESS: SyncProgressView = {
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
};

const EMPTY: SyncStatusView = {
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
    progress: IDLE_PROGRESS,
};

export function getSyncStatusView(extras: SyncStatusExtras = {}): SyncStatusView {
    const myId = getMyUPeerId();
    if (!myId) return EMPTY;
    const status = getSyncStatus(myId);
    const phase = computeSyncPhase(status.peers.map((peer) => toPhasePeer(peer)), Date.now());
    const history = getHistoryWork();
    const progress = trackSyncProgress({
        phase: phase.phase,
        historyDone: history.done,
        historyTotal: history.total,
        historyKnown: history.known,
        pendingOutbound: status.pendingMessages ?? 0,
        pendingInbound: history.known ? Math.max(0, history.total - history.done) : 0,
        pendingFiles: Math.max(0, Math.trunc(extras.activeFiles ?? 0)),
    });
    return { ...status, ...phase, devices: buildDevices(status), progress };
}

function toPhasePeer(peer: SyncStatus['peers'][number]): { historyCompleted: boolean; lastSeen: number } {
    return { historyCompleted: peer.historyCompleted === true, lastSeen: peer.lastSeen };
}

function buildDevices(status: SyncStatus): SyncDeviceView[] {
    const localDeviceId = getDeviceIdentity()?.deviceId ?? null;
    const peers = new Map(status.peers.map((peer) => [peer.deviceId.toLowerCase(), peer] as const));
    const devices: SyncDeviceView[] = [];
    const seen = new Set<string>();
    for (const entry of getMyAccountRegistry()?.devices ?? []) {
        const key = entry.deviceId.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const peer = peers.get(key);
        devices.push({
            deviceId: entry.deviceId,
            platform: entry.platform ?? 'desktop',
            state: key === localDeviceId?.toLowerCase()
                ? 'local'
                : peer
                    ? peer.state
                    : 'offline',
            lastSeen: peer ? peer.lastSeen : null,
        });
    }
    if (localDeviceId && !seen.has(localDeviceId.toLowerCase())) {
        devices.unshift({ deviceId: localDeviceId, platform: 'desktop', state: 'local', lastSeen: null });
    }
    return devices;
}
