import net from 'node:net';
import { YGGSTACK_ADMIN_HOST, YGGSTACK_ADMIN_PORT } from './yggstackShared.js';
import type { PeerInfo } from './peerManagerShared.js';

type AdminEnvelope = {
    status?: string;
    error?: string;
    response?: { peers?: Array<{ remote?: string; address?: string; port?: number; up?: boolean }> };
};

export type ConnectedPeer = Pick<PeerInfo, 'uri' | 'host' | 'country' | 'latencyMs' | 'score' | 'alive' | 'lat' | 'lon'>;

export async function fetchConnectedPeers(): Promise<ConnectedPeer[]> {
    const payload = await sendAdminRequest();
    return parseConnectedPeers(payload);
}

export function parseConnectedPeers(payload: string): ConnectedPeer[] {
    const envelope = JSON.parse(payload) as AdminEnvelope;
    if (envelope.status !== 'success' || !Array.isArray(envelope.response?.peers)) {
        throw new Error(envelope.error || 'Invalid getPeers response');
    }

    return envelope.response.peers.flatMap((peer) => {
        if (peer.up !== true) return [];
        const uri = peer.remote || (peer.address && peer.port ? `${peer.address}:${peer.port}` : '');
        if (!uri) return [];
        return [{ uri, host: uri, country: 'Unknown', latencyMs: null, score: 0, alive: true, lat: null, lon: null }];
    });
}

function sendAdminRequest(): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: YGGSTACK_ADMIN_HOST, port: YGGSTACK_ADMIN_PORT });
        let response = '';
        let settled = false;
        const fail = (error: Error) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            reject(error);
        };

        socket.setTimeout(2_000);
        socket.once('connect', () => socket.write('{"request":"getPeers","arguments":{}}\n'));
        socket.on('data', (chunk: Buffer) => { response += chunk.toString(); });
        socket.once('timeout', () => fail(new Error('Yggdrasil admin socket timed out')));
        socket.once('error', fail);
        socket.once('close', () => {
            if (settled) return;
            settled = true;
            if (!response.trim()) {
                reject(new Error('Yggdrasil admin socket returned an empty response'));
                return;
            }
            resolve(response);
        });
    });
}