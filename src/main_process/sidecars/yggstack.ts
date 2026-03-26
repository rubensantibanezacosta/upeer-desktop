import fs from 'node:fs';
import { warn, info, error } from '../security/secure-logger.js';
import { stopPeerManager } from './peer-manager.js';
import { ensureConfig, resolveYggstackPath } from './yggstackConfig.js';
import {
    MAX_RESTART_ATTEMPTS,
    RESTART_BASE_DELAY_MS,
    YGG_IPV6_REGEX,
    type AddressCallback,
    type StatusCallback,
} from './yggstackShared.js';
import { addAddressCallback, addStatusCallback, emitStatus, yggstackState } from './yggstackState.js';
import { bindYggstackOutput, ensureYggstackExecutable, getRestartDelayMs, spawnYggstackProcess } from './yggstackProcessSupport.js';

export type { YggStatus } from './yggstackShared.js';

export function onYggstackAddress(cb: AddressCallback): void {
    addAddressCallback(cb);
}

export function onYggstackStatus(cb: StatusCallback): void {
    addStatusCallback(cb);
}

export function getYggstackAddress(): string | null {
    return yggstackState.detectedAddress;
}

export function getRestartAttempts(): number {
    return yggstackState.restartAttempts;
}

export function getMaxRestartAttempts(): number {
    return MAX_RESTART_ATTEMPTS;
}

export async function forceRestart(): Promise<void> {
    if (yggstackState.process) {
        info('forceRestart: forcing termination of current process', undefined, 'yggstack');
        yggstackState.isQuitting = true;
        yggstackState.process.kill();
        yggstackState.process = null;
    }

    info('forceRestart: restarting by user request…', undefined, 'yggstack');
    yggstackState.restartAttempts = 0;
    yggstackState.isQuitting = false;
    try {
        await spawnYggstack();
    } catch (err) {
        error('forceRestart: error starting process', err, 'yggstack');
        scheduleRestart();
    }
}

export async function spawnYggstack(): Promise<void> {
    if (yggstackState.process) {
        info('Process already running, skipping spawn', undefined, 'yggstack');
        return;
    }

    const yggstackPath = resolveYggstackPath();

    if (!fs.existsSync(yggstackPath)) {
        throw new Error(
            `[yggstack] Binario no encontrado en: ${yggstackPath}\n` +
            `Ejecuta 'node scripts/download-yggstack.mjs' para descargarlo.`
        );
    }

    ensureYggstackExecutable(yggstackPath);
    const confPath = await ensureConfig(yggstackPath);

    info('Starting yggstack user-space sidecar', { path: yggstackPath, config: confPath }, 'yggstack');

    yggstackState.process = spawnYggstackProcess(yggstackPath, confPath);

    if (!yggstackState.process.pid) {
        yggstackState.process = null;
        throw new Error('[yggstack] El sistema operativo no pudo crear el proceso sidecar.');
    }

    info(`Process started with PID: ${yggstackState.process.pid}`, undefined, 'yggstack');
    emitStatus('connecting');

    bindYggstackOutput(yggstackState.process, tryExtractAddress);

    yggstackState.process.on('exit', (code, signal) => {
        if (yggstackState.isQuitting) {
            info('Sidecar stopped intentionally', undefined, 'yggstack');
            yggstackState.process = null;
            return;
        }

        warn(`Process terminated unexpectedly. Code: ${code ?? 'N/A'}, Signal: ${signal ?? 'N/A'}`, undefined, 'yggstack');
        yggstackState.process = null;
        yggstackState.detectedAddress = null;
        emitStatus('reconnecting');
        scheduleRestart();
    });

    yggstackState.process.on('error', (err) => {
        error('Sidecar process error', err.message, 'yggstack');
        if (!yggstackState.isQuitting) {
            yggstackState.process = null;
            yggstackState.detectedAddress = null;
            emitStatus('reconnecting');
            scheduleRestart();
        }
    });
}

function scheduleRestart(): void {
    if (yggstackState.restartAttempts >= MAX_RESTART_ATTEMPTS) {
        error(`Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Yggdrasil network unavailable`, undefined, 'yggstack');
        emitStatus('down');
        return;
    }

    yggstackState.restartAttempts++;
    const delayMs = getRestartDelayMs(yggstackState.restartAttempts, RESTART_BASE_DELAY_MS);
    info(`Retry ${yggstackState.restartAttempts}/${MAX_RESTART_ATTEMPTS} in ${Math.round(delayMs / 1000)} s…`, undefined, 'yggstack');
    emitStatus('reconnecting');

    setTimeout(async () => {
        if (yggstackState.isQuitting) {
            return;
        }
        try {
            await spawnYggstack();
        } catch (err) {
            error('Error in automatic restart', err, 'yggstack');
            scheduleRestart();
        }
    }, delayMs);
}

export async function stopYggstack(): Promise<void> {
    if (!yggstackState.process) {
        info('stopYggstack: no active process to stop', undefined, 'yggstack');
        return;
    }

    const pid = yggstackState.process.pid;
    info(`Stopping sidecar (PID: ${pid})…`, undefined, 'yggstack');
    yggstackState.isQuitting = true;
    yggstackState.restartAttempts = 0;

    const proc = yggstackState.process;

    yggstackState.process = null;
    yggstackState.detectedAddress = null;
    yggstackState.currentConfPath = null;
    stopPeerManager();

    return new Promise<void>((resolve) => {
        const forceKillTimer = setTimeout(() => {
            warn('Process did not respond to SIGTERM → forcing SIGKILL…', undefined, 'yggstack');
            try {
                proc.kill('SIGKILL');
            } catch {
                info('Process finished before SIGKILL fallback', undefined, 'yggstack');
            }
        }, 3000);

        proc.once('exit', () => {
            clearTimeout(forceKillTimer);
            info('Sidecar stopped correctly', undefined, 'yggstack');
            emitStatus('down');
            resolve();
        });

        try {
            proc.kill('SIGTERM');
        } catch (err) {
            error('Error sending SIGTERM', err, 'yggstack');
            clearTimeout(forceKillTimer);
            resolve();
        }
    });
}

function tryExtractAddress(text: string): void {
    if (yggstackState.detectedAddress) {
        return;
    }

    const match = YGG_IPV6_REGEX.exec(text);
    if (match) {
        yggstackState.detectedAddress = match[1];
        yggstackState.restartAttempts = 0;
        info(`Yggdrasil IPv6 address assigned: ${yggstackState.detectedAddress}`, undefined, 'yggstack');
        yggstackState.addressCallbacks.forEach(cb => cb(yggstackState.detectedAddress!));
        emitStatus('up', yggstackState.detectedAddress);
    }
}