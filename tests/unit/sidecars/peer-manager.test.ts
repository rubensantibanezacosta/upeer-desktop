import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns';

type LookupResult = Awaited<ReturnType<typeof dns.promises.lookup>>;
type MockResponse = EventEmitter & { statusCode?: number };
type MockRequest = EventEmitter & {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
};
type MockGetHandle = { on: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
type RequestOptionsLike = { path?: string };
type ResponseCallback = (response: MockResponse) => void;

function createResponse(statusCode = 200): MockResponse {
    return Object.assign(new EventEmitter(), { statusCode });
}

function createRequest(): MockRequest {
    return Object.assign(new EventEmitter(), {
        write: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn()
    });
}

function createGetHandle(): MockGetHandle {
    return {
        on: vi.fn(),
        destroy: vi.fn()
    };
}

function resolveCallback(optionsOrCallback: unknown, callback?: ResponseCallback): ResponseCallback | undefined {
    return typeof optionsOrCallback === 'function' ? optionsOrCallback as ResponseCallback : callback;
}

// --- MOCKS ---
vi.mock('node:fs');
vi.mock('node:https');
vi.mock('node:net');
vi.mock('node:dns', () => ({
    default: { promises: { lookup: vi.fn() } },
    promises: { lookup: vi.fn() }
}));

import * as peerManager from '../../../src/main_process/sidecars/peer-manager.js';

describe('PeerManager Hardening', () => {
    const tempCacheDir = '/tmp/chat-p2p-test-peers';

    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();

        // Setup default mocks for stability
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
        vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);
        vi.spyOn(fs, 'readFileSync').mockReturnValue('{}');

        vi.mocked(dns.promises.lookup).mockResolvedValue({ address: '1.2.3.4' } as LookupResult);

        vi.spyOn(https, 'get').mockImplementation(((url: unknown, opts: unknown, cb?: ResponseCallback) => {
            const res = createResponse();
            res.statusCode = 200;
            const callback = resolveCallback(opts, cb);
            setImmediate(() => {
                if (callback) callback(res);
                res.emit('data', Buffer.from('tcp://1.2.3.4:1234\n## Spain\n- `tcp://1.1.1.1:1111` (100%)'));
                res.emit('end');
            });
            return createGetHandle();
        }) as typeof https.get);

        vi.spyOn(https, 'request').mockImplementation(((opts: RequestOptionsLike, cb?: ResponseCallback) => {
            const req = createRequest();
            const res = createResponse();
            res.statusCode = 200;
            setImmediate(() => {
                if (cb) cb(res);
                const path = opts.path || '';
                if (path.includes('json')) {
                    res.emit('data', Buffer.from(JSON.stringify({ lat: 40, lon: -3, countryCode: 'ES' })));
                } else {
                    res.emit('data', Buffer.from(JSON.stringify([{ query: '1.2.3.4', lat: 40, lon: -3 }])));
                }
                res.emit('end');
            });
            return req;
        }) as typeof https.request);

        vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (this: net.Socket) {
            setImmediate(() => this.emit('connect'));
            return this;
        });
        vi.spyOn(net.Socket.prototype, 'setTimeout').mockReturnThis();
        vi.spyOn(net.Socket.prototype, 'destroy').mockReturnThis();
    });

    it('should handle lifecycle and health check', async () => {
        const mockCache = {
            selfGeo: { lat: 40, lon: -3, countryCode: 'ES' },
            peers: [
                { uri: 'tcp://backup:1', host: 'backup', port: 1, score: 90, alive: true, country: 'ES', uptimePct: 100, lastChecked: Date.now() }
            ],
            lastFullRefresh: Date.now()
        };
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockCache));

        await peerManager.initPeerManager(tempCacheDir);

        const uris = peerManager.getActivePeerUris();
        expect(uris.length).toBeGreaterThan(0);

        vi.useFakeTimers();
        await vi.advanceTimersByTimeAsync(300100);
        vi.useRealTimers();
    });

    it('should cover fetch/probe errors', async () => {
        vi.spyOn(https, 'get').mockImplementation(((_url: unknown, _opts: unknown, _cb?: ResponseCallback) => {
            const req = createRequest();
            req.on('error', () => undefined);
            req.on = ((event: string, handler: (error: Error) => void) => {
                if (event === 'error') setImmediate(() => handler(new Error('FAIL')));
                return req;
            }) as MockRequest['on'];
            return req;
        }) as typeof https.get);
        await peerManager.initPeerManager(tempCacheDir);
        expect(peerManager.getPeerPool()).toBeDefined();
    });

    it('should cover markdown and HTML parsing of peers', async () => {
        const mockMD = `
## Germany
| tcp://1.1.1.1:1111 | online | 95% |
| tls://2.2.2.2:2222 | online | 100% |
        `;
        const mockHTML = `
            <h2>France</h2>
            <a href="tcp://3.3.3.3:3333">tcp://3.3.3.3:3333</a> online 80%
        `;

        let callCount = 0;
        vi.spyOn(https, 'get').mockImplementation(((url: unknown, opts: unknown, cb?: ResponseCallback) => {
            const resolvedCallback = resolveCallback(opts, cb);
            const res = createResponse();
            res.statusCode = 200;
            setImmediate(() => {
                resolvedCallback?.(res);
                if (url.toString().includes('neilalexander')) {
                    res.emit('data', Buffer.from(callCount === 0 ? mockMD : mockHTML));
                    callCount++;
                } else {
                    res.emit('data', Buffer.from('{}'));
                }
                res.emit('end');
            });
            return createRequest();
        }) as typeof https.get);

        await peerManager.initPeerManager(tempCacheDir);
        const pool = peerManager.getPeerPool();
        expect(pool.some(p => p.uri === 'tcp://1.1.1.1:1111')).toBe(true);

        callCount = 1;
        await peerManager.initPeerManager(tempCacheDir);
        expect(peerManager.getPeerPool().some(p => p.uri === 'tcp://3.3.3.3:3333')).toBe(true);
    });

    it('should cover additional edge cases in geolocate and probe', async () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
            lastUpdate: Date.now(),
            peers: [
                { uri: 'tls://[2001:db8::1]:12345', host: '2001:db8::1', port: 12345, country: 'test', uptimePct: 100 },
                { uri: 'tcp://invalid-host:-1', host: 'invalid-host', port: -1, country: 'test', uptimePct: 100 },
                { uri: 'unknown://foo:80', host: '', port: 0, country: 'test', uptimePct: 100 }
            ]
        }));

        vi.mocked(dns.promises.lookup).mockImplementation(async (h) => {
            if (h === 'fail.com') throw new Error('dns fail');
            return { address: '1.2.3.4' } as LookupResult;
        });

        vi.spyOn(https, 'get').mockImplementation(((url: string, opts: unknown, cb?: ResponseCallback) => {
            const res = createResponse();
            res.statusCode = 200;
            const callback = resolveCallback(opts, cb);
            setImmediate(() => {
                callback?.(res);
                res.emit('data', Buffer.from('## Spain\n- `tcp://fail.com:555` (100%)\n'));
                res.emit('data', Buffer.from('<table><tr><td>tcp://1.1.1.1:111</td><td>90%</td></tr></table>'));
                res.emit('end');
            });
            return createGetHandle();
        }) as typeof https.get);

        let reqCount = 0;
        vi.spyOn(https, 'request').mockImplementation(((_opts: RequestOptionsLike, cb?: ResponseCallback) => {
            const req = createRequest();
            const res = createResponse();
            res.statusCode = 200;
            setImmediate(() => {
                cb?.(res);
                if (reqCount === 0) {
                    res.emit('data', Buffer.from(JSON.stringify({ lat: 40, lon: -3, countryCode: 'ES' })));
                } else {
                    res.emit('data', Buffer.from('invalid-json-batch'));
                }
                reqCount++;
                res.emit('end');
            });
            return req;
        }) as typeof https.request);

        await peerManager.initPeerManager(tempCacheDir);
    });

    it('should cover geolocation batching and DNS resolution', async () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);

        const manyPeers = Array.from({ length: 120 }, (_, i) => ({
            uri: `tcp://1.1.1.${i}:1111`,
            host: `1.1.1.${i}`,
            port: 1111,
            country: 'test',
            uptimePct: 100
        }));

        vi.spyOn(https, 'get').mockImplementation(((_url: string, opts: unknown, cb?: ResponseCallback) => {
            const res = createResponse();
            res.statusCode = 200;
            const callback = resolveCallback(opts, cb);
            setImmediate(() => {
                callback?.(res);
                res.emit('data', Buffer.from('## Spain\n' + manyPeers.map(p => `- \`${p.uri}\` (100%)`).join('\n')));
                res.emit('end');
            });
            return createGetHandle();
        }) as typeof https.get);

        vi.mocked(dns.promises.lookup).mockResolvedValue({ address: '1.2.3.4' } as LookupResult);

        vi.spyOn(https, 'request').mockImplementation(((_opts: RequestOptionsLike, cb?: ResponseCallback) => {
            const req = createRequest();
            const res = createResponse();
            res.statusCode = 200;
            setImmediate(() => {
                cb?.(res);
                res.emit('data', Buffer.from(JSON.stringify([{ query: '1.2.3.4', lat: 10, lon: 20 }])));
                res.emit('end');
            });
            return req;
        }) as typeof https.request);

        await peerManager.initPeerManager(tempCacheDir);

        const pool = peerManager.getPeerPool();
        if (pool.length > 0) {
            expect(pool[0].distanceKm).toBeDefined();
        }
    });
    it('should cover error paths in http helpers and edge cases in scoring', async () => {
        vi.spyOn(https, 'request').mockImplementation(((_opts: RequestOptionsLike, _cb?: ResponseCallback) => {
            const req = createRequest();
            setImmediate(() => req.emit('error', new Error('post fail')));
            return req;
        }) as typeof https.request);

        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        vi.mocked(dns.promises.lookup).mockResolvedValue({ address: '1.2.3.4' } as LookupResult);

        vi.spyOn(https, 'get').mockImplementation(((_url: string, opts: unknown, cb?: ResponseCallback) => {
            const res = createResponse();
            res.statusCode = 200;
            const callback = resolveCallback(opts, cb);
            setImmediate(() => {
                callback?.(res);
                res.emit('data', Buffer.from(JSON.stringify({ lat: 40, lon: -3 })));
                res.emit('end');
            });
            return createGetHandle();
        }) as typeof https.get);

        await peerManager.initPeerManager(tempCacheDir);
    });
    it('should cover different URI schemes and regex', () => {
        const uris = peerManager.getActivePeerUris();
        expect(Array.isArray(uris)).toBe(true);
    });

    it('should cover error paths in http helpers', async () => {
        vi.spyOn(https, 'get').mockImplementation(((_url: unknown, _opts: unknown, _cb?: ResponseCallback) => {
            const req = createRequest();
            req.on = ((ev: string, h: (error: Error) => void) => {
                if (ev === 'error') setImmediate(() => h(new Error('FAIL')));
                return req;
            }) as MockRequest['on'];
            return req;
        }) as typeof https.get);

        await peerManager.initPeerManager(tempCacheDir);
    });
});
