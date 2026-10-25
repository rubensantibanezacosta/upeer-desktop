import { getMyUPeerId } from '../../security/identity.js';
import { getDeviceIdentity } from '../../security/deviceIdentity.js';
import { getMyAccountRegistry } from '../accountRegistry.js';
import { getSyncStatus, type SyncStatus } from '../../storage/sync/status.js';

export type SyncDeviceState = 'local' | 'synced' | 'pending' | 'offline';

export type SyncDeviceView = {
    deviceId: string;
    platform: string;
    state: SyncDeviceState;
    lastSeen: number | null;
};

export type SyncStatusView = SyncStatus & {
    devices: SyncDeviceView[];
};

const EMPTY: SyncStatusView = {
    state: 'disabled',
    pendingEvents: 0,
    pendingEntityIds: [],
    peers: [],
    devices: [],
};

export function getSyncStatusView(): SyncStatusView {
    const myId = getMyUPeerId();
    if (!myId) return EMPTY;
    const status = getSyncStatus(myId);
    return { ...status, devices: buildDevices(status) };
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
