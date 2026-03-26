import type { GeoCoords, PeerInfo } from './peerManagerShared.js';

export const peerManagerState: {
    activePeers: PeerInfo[];
    peerPool: PeerInfo[];
    selfGeo: GeoCoords | null;
    healthTimer: NodeJS.Timeout | null;
    peersChangedCb: ((uris: string[]) => void) | null;
} = {
    activePeers: [],
    peerPool: [],
    selfGeo: null,
    healthTimer: null,
    peersChangedCb: null,
};
