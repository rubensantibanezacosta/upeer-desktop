import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';

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

        mocks.exec.mockImplementation((cmd: any, opts: any, cb?: any) => {
            const callback = typeof opts === 'function' ? opts : cb;
            if (callback) callback(null, 'genconf-content', '');
            return {} as any;
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
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = vi.fn();
        mockProcess.pid = 1234;

        mocks.spawn.mockReturnValue(mockProcess);

        const spawnPromise = yggstack.spawnYggstack();

        // El truco definitivo: emitir en el SIGUIENTE tick del loop de eventos
        // para asegurar que spawnYggstack ya esté escuchando 'data'
        await new Promise(resolve => setTimeout(resolve, 0));
        mockProcess.stdout.emit('data', Buffer.from('IPv6: 200:1234:5678::1\n'));

        await spawnPromise;
        expect(yggstack.getYggstackAddress()).toBe('200:1234:5678::1');
    });

    it('should correctly handle address detection from logs', async () => {
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = vi.fn();
        mockProcess.pid = 9999;
        mocks.spawn.mockReturnValue(mockProcess);

        // Limpiar estado
        await yggstack.stopYggstack();
        await yggstack.forceRestart();

        // Simular salida en stderr (yggstack a veces escribe ahí)
        mockProcess.stderr.emit('data', Buffer.from('Core address: 200:abcd:1234::1\n'));
        expect(yggstack.getYggstackAddress()).toBe('200:abcd:1234::1');
    });

    it('should limit maximum restart attempts', async () => {
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = vi.fn();
        mockProcess.pid = 8888;
        mocks.spawn.mockReturnValue(mockProcess);

        await yggstack.stopYggstack();
        await yggstack.forceRestart();

        const max = yggstack.getMaxRestartAttempts();
        // Forzamos el límite emitiendo crashes
        for (let i = 0; i < max; i++) {
            mockProcess.emit('exit', 1);
        }

        expect(yggstack.getRestartAttempts()).toBe(max);

        // El siguiente crash no debería incrementar más (o debería mantenerse en el límite)
        mockProcess.emit('exit', 1);
        expect(yggstack.getRestartAttempts()).toBe(max);
    });

    it('should manage SOCKS status callbacks', async () => {
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = vi.fn();
        mockProcess.pid = 7000;
        mockProcess.stdout.pipe = vi.fn().mockReturnValue(new EventEmitter());
        mockProcess.stderr.pipe = vi.fn().mockReturnValue(new EventEmitter());
        mocks.spawn.mockReturnValue(mockProcess);

        const statusSpy = vi.fn();
        yggstack.onYggstackStatus(statusSpy);

        // Limpiar estado previo
        await yggstack.stopYggstack();
        mockProcess.emit('exit');

        statusSpy.mockClear();

        await yggstack.forceRestart();

        // Simular caída inesperada (crash) para ver el cambio de estado
        mockProcess.emit('exit', 1, null);

        expect(statusSpy).toHaveBeenCalledWith('reconnecting', undefined);
    });

    it('should cover exponential backoff and scheduleRestart', async () => {
        vi.useFakeTimers();
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = vi.fn();
        mockProcess.pid = 8800;
        mockProcess.stdout.pipe = vi.fn().mockReturnValue(new EventEmitter());
        mockProcess.stderr.pipe = vi.fn().mockReturnValue(new EventEmitter());

        mocks.spawn.mockReturnValue(mockProcess);

        // Primero arrancamos para que yggstackProcess esté asignado
        await yggstack.forceRestart();
        mocks.spawn.mockClear();

        // Forzamos un crash inesperado
        mockProcess.emit('exit', 1, 'SIGKILL');

        // Adelantamos el tiempo para disparar el setTimeout de scheduleRestart
        await vi.advanceTimersByTimeAsync(10000);

        // El spawnYggstack debería haberse llamado tras el crash
        expect(mocks.spawn).toHaveBeenCalled();

        vi.useRealTimers();
    });

    it('should handle process error event', async () => {
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = vi.fn();
        mockProcess.pid = 8801;
        mockProcess.stdout.pipe = vi.fn().mockReturnValue(new EventEmitter());
        mockProcess.stderr.pipe = vi.fn().mockReturnValue(new EventEmitter());
        mocks.spawn.mockReturnValue(mockProcess);

        await yggstack.forceRestart();

        // Emitimos error en el proceso
        mockProcess.emit('error', new Error('Spawn Failed'));

        // Debería marcarse como down y no explotar
        expect(yggstack.getYggstackAddress()).toBeNull();
    });

    it('should skip spawn if process is already running', async () => {
        mocks.spawn.mockClear();
        // Ya hay uno corriendo por el setup o test anterior si no se limpió
        await yggstack.spawnYggstack();
        const calls = mocks.spawn.mock.calls.length;

        // Intentamos arrancar otro
        await yggstack.spawnYggstack();
        expect(mocks.spawn.mock.calls.length).toBe(calls);
    });

    it('should handle missing binary error', async () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        await expect(yggstack.spawnYggstack()).rejects.toThrow(/Binario no encontrado/);
    });

    it('should update configuration when peers change', async () => {
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = vi.fn();
        mockProcess.pid = 9991;
        mockProcess.stdout.pipe = vi.fn().mockReturnValue(new EventEmitter());
        mockProcess.stderr.pipe = vi.fn().mockReturnValue(new EventEmitter());
        mocks.spawn.mockReturnValue(mockProcess);

        // Limpiar estado previo
        await yggstack.stopYggstack();

        // Arrancamos fresco
        await yggstack.spawnYggstack();

        // El setOnPeersChanged mock guardó el callback en call 0 del setup previo
        // Importamos dinámicamente para acceder al mock real de esta ejecución
        const pmMock = await import('../../../src/main_process/sidecars/peer-manager.js');

        // Buscamos el último callback registrado (el de este spawn)
        const lastCall = (pmMock.setOnPeersChanged as any).mock.calls.length - 1;
        const cb = (pmMock.setOnPeersChanged as any).mock.calls[lastCall][0];

        const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { });
        vi.spyOn(fs, 'readFileSync').mockReturnValue('Peers: [\n]\nAdminListen: none');

        // Disparamos el cambio de peers
        cb(['tcp://new-peer:1234']);

        expect(writeSpy).toHaveBeenCalled();
        // Verificar que alguna de las llamadas a writeFileSync contenía el peer
        const anyWriteHasPeer = writeSpy.mock.calls.some(c => String(c[1]).includes('tcp://new-peer:1234'));
        expect(anyWriteHasPeer).toBe(true);
    });

    it('should force SIGKILL if SIGTERM is not enough', async () => {
        vi.useFakeTimers();
        const mockKill = vi.fn();
        const mockProcess = new EventEmitter() as any;
        mockProcess.pid = 999;
        mockProcess.kill = mockKill;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        // Agregamos pipe para que no falle al intentar leer logs
        mockProcess.stdout.pipe = vi.fn().mockReturnValue(new EventEmitter());
        mockProcess.stderr.pipe = vi.fn().mockReturnValue(new EventEmitter());

        mocks.spawn.mockReturnValue(mockProcess);

        const spawnPromise = yggstack.spawnYggstack();

        // Simular que el proceso está arrancado y emite su dirección
        await vi.waitUntil(() => mocks.spawn.mock.calls.length > 0);
        mockProcess.stdout.emit('data', Buffer.from('IPv6: 200:1:2:3::1\n'));
        await spawnPromise;

        const stopPromise = yggstack.stopYggstack();

        expect(mockKill).toHaveBeenCalledWith('SIGTERM');

        // Adelantamos los timers para disparar el fallback a SIGKILL
        vi.advanceTimersByTime(3001);
        expect(mockKill).toHaveBeenCalledWith('SIGKILL');

        // Resolvemos el proceso finalmente para que stopYggstack termine su promesa
        mockProcess.emit('exit');
        await stopPromise;

        vi.useRealTimers();
    });

    it('should handle error during scheduleRestart spawn', async () => {
        vi.useFakeTimers();
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = vi.fn();
        mockProcess.pid = 9992;
        mockProcess.stdout.pipe = vi.fn().mockReturnValue(new EventEmitter());
        mockProcess.stderr.pipe = vi.fn().mockReturnValue(new EventEmitter());
        mocks.spawn.mockReturnValue(mockProcess);

        await yggstack.forceRestart();

        // Simular que el próximo spawn fallará
        mocks.spawn.mockImplementationOnce(() => { throw new Error('CATASTROPHIC'); });

        // Crash inicial para disparar scheduleRestart
        mockProcess.emit('exit', 1, null);

        // Adelantamos tiempo
        await vi.advanceTimersByTimeAsync(5000);

        // Debería haber intentado el spawn fallido y re-programado otro (2 llamadas en total al final)
        expect(yggstack.getRestartAttempts()).toBeGreaterThan(1);

        vi.useRealTimers();
    });

    it('should generate initial configuration if not exists', async () => {
        vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
            if (p.includes('yggstack.conf')) return false; // El config no existe
            return true; // El binario sí existe
        });

        mocks.exec.mockImplementation((_cmd, _opts, cb) => {
            cb(null, 'Peers: []', ''); // Simula salida de -genconf
        });

        const mockProcess = new EventEmitter() as any;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = vi.fn();
        mockProcess.pid = 9993;
        mockProcess.stdout.pipe = vi.fn().mockReturnValue(new EventEmitter());
        mockProcess.stderr.pipe = vi.fn().mockReturnValue(new EventEmitter());
        mocks.spawn.mockReturnValue(mockProcess);

        await yggstack.spawnYggstack();

        expect(mocks.exec).toHaveBeenCalledWith(expect.stringContaining('-genconf'), expect.anything(), expect.anything());
    });

    it('should handle SIGTERM errors in stopYggstack', async () => {
        const mockKill = vi.fn().mockImplementation(() => { throw new Error('Kill Failed'); });
        const mockProcess = new EventEmitter() as any;
        mockProcess.pid = 999;
        mockProcess.kill = mockKill;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.stdout.pipe = vi.fn().mockReturnValue(new EventEmitter());
        mockProcess.stderr.pipe = vi.fn().mockReturnValue(new EventEmitter());

        mocks.spawn.mockReturnValue(mockProcess);

        const spawnPromise = yggstack.spawnYggstack();
        await vi.waitUntil(() => mocks.spawn.mock.calls.length > 0);
        mockProcess.stdout.emit('data', Buffer.from('IPv6: 200:1:2:3::1\n'));
        await spawnPromise;

        // Si proc.kill('SIGTERM') lanza error, la promesa debe resolverse inmediatamente
        await yggstack.stopYggstack();
    });

    it('should handle automatic restarts on unexpected exit', async () => {
        vi.useFakeTimers();
        const mockProcess = new EventEmitter() as any;
        mockProcess.pid = 4444;
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = vi.fn();
        mockProcess.stdout.pipe = vi.fn().mockReturnValue(new EventEmitter());
        mockProcess.stderr.pipe = vi.fn().mockReturnValue(new EventEmitter());

        mocks.spawn.mockReturnValue(mockProcess);

        // Arrancamos
        const p = yggstack.spawnYggstack();
        await vi.advanceTimersByTimeAsync(10);
        mockProcess.stdout.emit('data', Buffer.from('IPv6: 200:1:2:3::1\n'));
        await p;

        const statusSpy = vi.fn();
        yggstack.onYggstackStatus(statusSpy);

        // Simular salida inesperada (error code 1)
        mockProcess.emit('exit', 1);

        // Avanzar tiempo para que se ejecute el backoff de 3s
        await vi.advanceTimersByTimeAsync(3500);

        // Debería haber un segundo intento de spawn
        expect(mocks.spawn.mock.calls.length).toBeGreaterThanOrEqual(2);
        vi.useRealTimers();
    });
});
