import { describe, expect, it, vi } from 'vitest';

const spawn = vi.hoisted(() => vi.fn(() => ({ pid: 123 })));

vi.mock('node:child_process', () => ({ default: { spawn }, spawn }));
vi.mock('node:fs', () => ({ default: { chmodSync: vi.fn() } }));
vi.mock('../../../src/main_process/security/secure-logger.js', () => ({ warn: vi.fn() }));

import { spawnYggstackProcess } from '../../../src/main_process/sidecars/yggstackProcessSupport.js';

describe('yggstack process arguments', () => {
    it('exposes the media UDP port through the local loopback listener', () => {
        spawnYggstackProcess('/yggstack', '/yggstack.conf');

        expect(spawn).toHaveBeenCalledWith('/yggstack', [
            '-useconffile', '/yggstack.conf',
            '-socks', '127.0.0.1:9050',
            '-remote-tcp', '50005',
            '-remote-udp', '50006:127.0.0.1:50006',
        ], { stdio: ['ignore', 'pipe', 'pipe'] });
    });
});