import { describe, expect, it } from 'vitest';
import { parseConnectedPeers } from '../../../src/main_process/sidecars/yggstackAdmin.js';

describe('yggstack admin peer status', () => {
    it('returns only peers reported up by getPeers', () => {
        const result = parseConnectedPeers(JSON.stringify({
            status: 'success',
            response: {
                peers: [
                    { remote: 'tls://peer-a:1234', up: true },
                    { remote: 'tls://peer-b:1234', up: false },
                ],
            },
        }));

        expect(result.map(peer => peer.uri)).toEqual(['tls://peer-a:1234']);
    });

    it('rejects admin errors and invalid response schemas', () => {
        expect(() => parseConnectedPeers('{invalid')).toThrow();
        expect(() => parseConnectedPeers(JSON.stringify({ status: 'error', error: 'unknown action' }))).toThrow('unknown action');
    });
});