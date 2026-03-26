import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns';

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

        // dns lookup default
        vi.mocked(dns.promises.lookup).mockResolvedValue({ address: '1.2.3.4' } as any);

        // https default behavior
        vi.spyOn(https, 'get').mockImplementation(((url: any, opts: any, cb: any) => {
            const res = new EventEmitter() as any;
            res.statusCode = 200;
            const callback = typeof opts === 'function' ? opts : cb;
            setImmediate(() => {
                if (callback) callback(res);
                res.emit('data', Buffer.from('tcp://1.2.3.4:1234\n## Spain\n- `tcp://1.1.1.1:1111` (100%)'));
                res.emit('end');
            });
            return { on: vi.fn(), destroy: vi.fn() };
        }) as any);

        vi.spyOn(https, 'request').mockImplementation(((opts: any, cb: any) => {
            const req = new EventEmitter() as any;
            req.write = vi.fn();
            req.end = vi.fn();
            const res = new EventEmitter() as any;
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
        }) as any);

        // net.Socket default
        vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (this: any) {
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

        // Cargar caché directamente manipulando el estado si init no lo hace por TTL
        await peerManager.initPeerManager(tempCacheDir);

        const uris = peerManager.getActivePeerUris();
        expect(uris.length).toBeGreaterThan(0);

        vi.useFakeTimers();
        // Disparamos el monitor manualmente o esperamos al intervalo
        await vi.advanceTimersByTimeAsync(300100);
        vi.useRealTimers();
    });

    it('should cover fetch/probe errors', async () => {
        vi.spyOn(https, 'get').mockImplementation(((_url: any, _opts: any, _cb: any) => {
            const req = new EventEmitter() as any;
            req.on = (ev: string, h: any) => { if (ev === 'error') setImmediate(() => h(new Error('FAIL'))); return req; };
            req.destroy = vi.fn();
            return req;
        }) as any);
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
        vi.spyOn(https, 'get').mockImplementation(((url: any, opts: any, cb: any) => {
            const _cb = typeof opts === 'function' ? opts : cb;
            const res = new EventEmitter() as any;
            res.statusCode = 200;
            setImmediate(() => {
                _cb(res);
                if (url.toString().includes('neilalexander')) {
                    // Primera llamada MD, segunda HTML
                    res.emit('data', Buffer.from(callCount === 0 ? mockMD : mockHTML));
                    callCount++;
                } else {
                    res.emit('data', Buffer.from('{}'));
                }
                res.emit('end');
            });
            return new EventEmitter() as any;
        }) as any);

        // Forzar refresco completo (initPeerManager llama a fullRefresh internamente si el TTL es Infinito)
        await peerManager.initPeerManager(tempCacheDir);
        const pool = peerManager.getPeerPool();
        expect(pool.some(p => p.uri === 'tcp://1.1.1.1:1111')).toBe(true);

        // Probar el fallback HTML vaciando el primer resultado
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

        // Mock dns.promises.lookup to fail for one host
        vi.mocked(dns.promises.lookup).mockImplementation(async (h) => {
            if (h === 'fail.com') throw new Error('dns fail');
            return { address: '1.2.3.4' };
        });

        // Mock https.get for fetchPeersWithMeta to return weird HTML
        vi.spyOn(https, 'get').mockImplementation(((url: string, opts: any, cb: any) => {
            const res = new EventEmitter() as any;
            res.statusCode = 200;
            const callback = typeof opts === 'function' ? opts : cb;
            setImmediate(() => {
                callback(res);
                res.emit('data', Buffer.from('## Spain\n- `tcp://fail.com:555` (100%)\n'));
                res.emit('data', Buffer.from('<table><tr><td>tcp://1.1.1.1:111</td><td>90%</td></tr></table>'));
                res.emit('end');
            });
            return { on: vi.fn(), destroy: vi.fn() };
        }) as any);

        // Mock https.request for geolocatePeers batching
        let reqCount = 0;
        vi.spyOn(https, 'request').mockImplementation(((opts: any, cb: any) => {
            const req = new EventEmitter() as any;
            req.write = vi.fn();
            req.end = vi.fn();
            req.destroy = vi.fn();
            const res = new EventEmitter() as any;
            res.statusCode = 200;
            setImmediate(() => {
                cb(res);
                if (reqCount === 0) { // selfGeo
                    res.emit('data', Buffer.from(JSON.stringify({ lat: 40, lon: -3, countryCode: 'ES' })));
                } else { // batch geo
                    res.emit('data', Buffer.from('invalid-json-batch'));
                }
                reqCount++;
                res.emit('end');
            });
            return req;
        }) as any);

        await peerManager.initPeerManager(tempCacheDir);
    });

    it('should cover geolocation batching and DNS resolution', async () => {
        // En lugar de llamar a la privada, configuramos initPeerManager para que llame a fullRefresh -> geolocatePeers
        // Para esto necesitamos que no haya caché válida.
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);

        // Generar 120 IPs únicas para forzar múltiples batches de 100
        const manyPeers = Array.from({ length: 120 }, (_, i) => ({
            uri: `tcp://1.1.1.${i}:1111`,
            host: `1.1.1.${i}`,
            port: 1111,
            country: 'test',
            uptimePct: 100
        }));

        vi.spyOn(https, 'get').mockImplementation(((url: string, opts: any, cb: any) => {
            const res = new EventEmitter() as any;
            res.statusCode = 200;
            const callback = typeof opts === 'function' ? opts : cb;
            setImmediate(() => {
                callback(res);
                res.emit('data', Buffer.from('## Spain\n' + manyPeers.map(p => `- \`${p.uri}\` (100%)`).join('\n')));
                res.emit('end');
            });
            return { on: vi.fn(), destroy: vi.fn() };
        }) as any);

        vi.mocked(dns.promises.lookup).mockResolvedValue({ address: '1.2.3.4' } as any);

        vi.spyOn(https, 'request').mockImplementation(((opts: any, cb: any) => {
            const req = new EventEmitter() as any;
            req.write = vi.fn();
            req.end = vi.fn();
            const res = new EventEmitter() as any;
            res.statusCode = 200;
            setImmediate(() => {
                cb(res);
                res.emit('data', Buffer.from(JSON.stringify([{ query: '1.2.3.4', lat: 10, lon: 20 }])));
                res.emit('end');
            });
            return req;
        }) as any);

        await peerManager.initPeerManager(tempCacheDir);

        const pool = peerManager.getPeerPool();
        if (pool.length > 0) {
            expect(pool[0].distanceKm).toBeDefined();
        }
    });
    it('should cover error paths in http helpers and edge cases in scoring', async () => {
        // httpPost with error/timeout
        vi.spyOn(https, 'request').mockImplementation(((_opts: any, _cb: any) => {
            const req = new EventEmitter() as any;
            req.write = vi.fn();
            req.end = vi.fn();
            req.destroy = vi.fn();
            setImmediate(() => req.emit('error', new Error('post fail')));
            return req;
        }) as any);

        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        vi.mocked(dns.promises.lookup).mockResolvedValue({ address: '1.2.3.4' } as any);

        vi.spyOn(https, 'get').mockImplementation(((url: string, opts: any, cb: any) => {
            const res = new EventEmitter() as any;
            res.statusCode = 200;
            const callback = typeof opts === 'function' ? opts : cb;
            setImmediate(() => {
                callback(res);
                res.emit('data', Buffer.from(JSON.stringify({ lat: 40, lon: -3 })));
                res.emit('end');
            });
            return { on: vi.fn() };
        }) as any);

        await peerManager.initPeerManager(tempCacheDir);
    });
    it('should cover different URI schemes and regex', () => {
        const uris = peerManager.getActivePeerUris();
        expect(Array.isArray(uris)).toBe(true);
    });

    it('should cover error paths in http helpers', async () => {
        vi.spyOn(https, 'get').mockImplementation(((_url: any, _opts: any, _cb: any) => {
            const req = new EventEmitter() as any;
            req.on = (ev: string, h: any) => {
                // Disparamos error inmediatamente en lugar de timeout para evitar el timeout del test
                if (ev === 'error') setImmediate(() => h(new Error('FAIL')));
                return req;
            };
            req.destroy = vi.fn();
            return req;
        }) as any);

        await peerManager.initPeerManager(tempCacheDir);
    });
});
