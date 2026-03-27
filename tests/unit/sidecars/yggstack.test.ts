import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;
type MockPipeSource = EventEmitter & { pipe: ReturnType<typeof vi.fn> };
type MockProcess = EventEmitter & {
    stdout: MockPipeSource;
    stderr: MockPipeSource;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
};
type PeerChangedCallback = (uris: string[]) => void;

function createPipeSource(): MockPipeSource {
    return Object.assign(new EventEmitter(), {
        pipe: vi.fn().mockReturnValue(new EventEmitter())
    });
}

function createMockProcess(pid: number): MockProcess {
    return Object.assign(new EventEmitter(), {
        stdout: createPipeSource(),
        stderr: createPipeSource(),
        kill: vi.fn(),
        pid
    });
}

const mocks = vi.hoisted(() => ({
    spawn: vi.fn(),
    exec: vi.fn(),
}));

vi.mock('node:child_process', () => ({
    spawn: mocks.spawn,
    exec: mocks.exec,
    ChildProcess: class extends EventEmitter { },
    default: {
        spawn: mocks.spawn,
        exec: mocks.exec,
    }
}));

// Mocks de Electron
vi.mock('electron', () => ({
    app: {
        isPackaged: false,
        getAppPath: () => '/mock/app',
        getPath: () => '/mock/user-data',
        getName: () => 'upeer-chat',
    }
}));

// Mocks de sidecars/peer-manager.js
vi.mock('../../../src/main_process/sidecars/peer-manager.js', () => ({
    initPeerManager: vi.fn().mockResolvedValue(['tcp://p1:1']),
    stopPeerManager: vi.fn(),
    setOnPeersChanged: vi.fn(),
    getActivePeerUris: vi.fn().mockReturnValue(['tcp://p1:1']),
}));

// Mocks de logging
vi.mock('../../../src/main_process/security/secure-logger.js', () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}));

import * as yggstack from '../../../src/main_process/sidecars/yggstack.js';

describe('Yggstack Sidecar - Unit Tests', () => {

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockReturnValue('Peers: []\nAdminListen: none');
        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { });

        mocks.exec.mockImplementation((_cmd: unknown, opts: unknown, cb?: ExecCallback) => {
            const callback = typeof opts === 'function' ? opts : cb;
            if (callback) callback(null, 'genconf-content', '');
            return {};
        });
    });

    afterEach(() => {
        yggstack.stopYggstack();
    });

    it('should correctly resolve binary path for different platforms', async () => {
        const originalPlatform = process.platform;
        const platforms: Array<'linux' | 'win32' | 'darwin'> = ['linux', 'win32', 'darwin'];

        for (const p of platforms) {
            Object.defineProperty(process, 'platform', { value: p, configurable: true });
            Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });

            vi.spyOn(fs, 'existsSync').mockReturnValue(false);
            await expect(yggstack.spawnYggstack()).rejects.toThrow(/Binario no encontrado/);
        }
        Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should handle yggstack process lifecycle', async () => {
        const mockProcess = createMockProcess(1234);

        mocks.spawn.mockReturnValue(mockProcess);

        const spawnPromise = yggstack.spawnYggstack();

        await new Promise(resolve => setTimeout(resolve, 0));
        mockProcess.stdout.emit('data', Buffer.from('IPv6: 200:1234:5678::1\n'));

        await spawnPromise;
        expect(yggstack.getYggstackAddress()).toBe('200:1234:5678::1');
    });

    it('should correctly handle address detection from logs', async () => {
        const mockProcess = createMockProcess(9999);
        mocks.spawn.mockReturnValue(mockProcess);

        await yggstack.stopYggstack();
        await yggstack.forceRestart();

        mockProcess.stderr.emit('data', Buffer.from('Core address: 200:abcd:1234::1\n'));
        expect(yggstack.getYggstackAddress()).toBe('200:abcd:1234::1');
    });

    it('should limit maximum restart attempts', async () => {
        const mockProcess = createMockProcess(8888);
        mocks.spawn.mockReturnValue(mockProcess);

        await yggstack.stopYggstack();
        await yggstack.forceRestart();

        const max = yggstack.getMaxRestartAttempts();
        for (let i = 0; i < max; i++) {
            mockProcess.emit('exit', 1);
        }

        expect(yggstack.getRestartAttempts()).toBe(max);

        mockProcess.emit('exit', 1);
        expect(yggstack.getRestartAttempts()).toBe(max);
    });

    it('should manage SOCKS status callbacks', async () => {
        const mockProcess = createMockProcess(7000);
        mocks.spawn.mockReturnValue(mockProcess);

        const statusSpy = vi.fn();
        yggstack.onYggstackStatus(statusSpy);

        await yggstack.stopYggstack();
        mockProcess.emit('exit');

        statusSpy.mockClear();

        await yggstack.forceRestart();

        mockProcess.emit('exit', 1, null);

        expect(statusSpy).toHaveBeenCalledWith('reconnecting', undefined);
    });

    it('should cover exponential backoff and scheduleRestart', async () => {
        vi.useFakeTimers();
        const mockProcess = createMockProcess(8800);

        mocks.spawn.mockReturnValue(mockProcess);

        await yggstack.forceRestart();
        mocks.spawn.mockClear();

        mockProcess.emit('exit', 1, 'SIGKILL');

        await vi.advanceTimersByTimeAsync(10000);

        expect(mocks.spawn).toHaveBeenCalled();

        vi.useRealTimers();
    });

    it('should handle process error event', async () => {
        const mockProcess = createMockProcess(8801);
        mocks.spawn.mockReturnValue(mockProcess);

        await yggstack.forceRestart();

        mockProcess.emit('error', new Error('Spawn Failed'));

        expect(yggstack.getYggstackAddress()).toBeNull();
    });

    it('should skip spawn if process is already running', async () => {
        mocks.spawn.mockClear();
        await yggstack.spawnYggstack();
        const calls = mocks.spawn.mock.calls.length;

        await yggstack.spawnYggstack();
        expect(mocks.spawn.mock.calls.length).toBe(calls);
    });

    it('should handle missing binary error', async () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        await expect(yggstack.spawnYggstack()).rejects.toThrow(/Binario no encontrado/);
    });

    it('should update configuration when peers change', async () => {
        const mockProcess = createMockProcess(9991);
        mocks.spawn.mockReturnValue(mockProcess);

        await yggstack.stopYggstack();

        await yggstack.spawnYggstack();

        const pmMock = await import('../../../src/main_process/sidecars/peer-manager.js');

        const setOnPeersChangedMock = vi.mocked(pmMock.setOnPeersChanged);
        const lastCall = setOnPeersChangedMock.mock.calls.length - 1;
        const cb = setOnPeersChangedMock.mock.calls[lastCall]?.[0] as PeerChangedCallback;

        const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { });
        vi.spyOn(fs, 'readFileSync').mockReturnValue('Peers: [\n]\nAdminListen: none');

        cb(['tcp://new-peer:1234']);

        expect(writeSpy).toHaveBeenCalled();
        const anyWriteHasPeer = writeSpy.mock.calls.some(c => String(c[1]).includes('tcp://new-peer:1234'));
        expect(anyWriteHasPeer).toBe(true);
    });

    it('should force SIGKILL if SIGTERM is not enough', async () => {
        vi.useFakeTimers();
        const mockKill = vi.fn();
        const mockProcess = createMockProcess(999);
        mockProcess.kill = mockKill;

        mocks.spawn.mockReturnValue(mockProcess);

        const spawnPromise = yggstack.spawnYggstack();

        await vi.waitUntil(() => mocks.spawn.mock.calls.length > 0);
        mockProcess.stdout.emit('data', Buffer.from('IPv6: 200:1:2:3::1\n'));
        await spawnPromise;

        const stopPromise = yggstack.stopYggstack();

        expect(mockKill).toHaveBeenCalledWith('SIGTERM');

        vi.advanceTimersByTime(3001);
        expect(mockKill).toHaveBeenCalledWith('SIGKILL');

        mockProcess.emit('exit');
        await stopPromise;

        vi.useRealTimers();
    });

    it('should handle error during scheduleRestart spawn', async () => {
        vi.useFakeTimers();
        const mockProcess = createMockProcess(9992);
        mocks.spawn.mockReturnValue(mockProcess);

        await yggstack.forceRestart();

        mocks.spawn.mockImplementationOnce(() => { throw new Error('CATASTROPHIC'); });

        mockProcess.emit('exit', 1, null);

        await vi.advanceTimersByTimeAsync(5000);

        expect(yggstack.getRestartAttempts()).toBeGreaterThan(1);

        vi.useRealTimers();
    });

    it('should generate initial configuration if not exists', async () => {
        vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
            const path = String(p);
            if (path.includes('yggstack.conf')) return false;
            return true;
        });

        mocks.exec.mockImplementation((_cmd, _opts, cb) => {
            cb?.(null, 'Peers: []', '');
        });

        const mockProcess = createMockProcess(9993);
        mocks.spawn.mockReturnValue(mockProcess);

        await yggstack.spawnYggstack();

        expect(mocks.exec).toHaveBeenCalledWith(expect.stringContaining('-genconf'), expect.anything(), expect.anything());
    });

    it('should handle SIGTERM errors in stopYggstack', async () => {
        const mockKill = vi.fn().mockImplementation(() => { throw new Error('Kill Failed'); });
        const mockProcess = createMockProcess(999);
        mockProcess.kill = mockKill;

        mocks.spawn.mockReturnValue(mockProcess);

        const spawnPromise = yggstack.spawnYggstack();
        await vi.waitUntil(() => mocks.spawn.mock.calls.length > 0);
        mockProcess.stdout.emit('data', Buffer.from('IPv6: 200:1:2:3::1\n'));
        await spawnPromise;

        await yggstack.stopYggstack();
    });

    it('should handle automatic restarts on unexpected exit', async () => {
        vi.useFakeTimers();
        const mockProcess = createMockProcess(4444);

        mocks.spawn.mockReturnValue(mockProcess);

        const p = yggstack.spawnYggstack();
        await vi.advanceTimersByTimeAsync(10);
        mockProcess.stdout.emit('data', Buffer.from('IPv6: 200:1:2:3::1\n'));
        await p;

        const statusSpy = vi.fn();
        yggstack.onYggstackStatus(statusSpy);

        mockProcess.emit('exit', 1);

        await vi.advanceTimersByTimeAsync(3500);

        expect(mocks.spawn.mock.calls.length).toBeGreaterThanOrEqual(2);
        vi.useRealTimers();
    });
});
