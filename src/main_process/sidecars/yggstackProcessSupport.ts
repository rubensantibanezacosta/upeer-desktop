import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { warn } from '../security/secure-logger.js';
import { APP_P2P_PORT, SOCKS_HOST, SOCKS_PORT } from './yggstackShared.js';

export const ensureYggstackExecutable = (yggstackPath: string) => {
    if (process.platform === 'win32') {
        return;
    }
    try {
        fs.chmodSync(yggstackPath, 0o755);
    } catch (error) {
        warn('Could not apply chmod to binary', error, 'yggstack');
    }
};

export const spawnYggstackProcess = (yggstackPath: string, confPath: string) => spawn(
    yggstackPath,
    [
        '-useconffile', confPath,
        '-socks', `${SOCKS_HOST}:${SOCKS_PORT}`,
        '-remote-tcp', `${APP_P2P_PORT}`,
    ],
    {
        stdio: ['ignore', 'pipe', 'pipe'],
    }
);

export const bindYggstackOutput = (proc: ChildProcess, onLine: (line: string) => void) => {
    proc.stdout?.on('data', (chunk: Buffer) => {
        const line = chunk.toString();
        process.stdout.write(`[yggstack] ${line}`);
        onLine(line);
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
        const line = chunk.toString();
        process.stderr.write(`[yggstack:err] ${line}`);
        onLine(line);
    });
};

export const getRestartDelayMs = (attempt: number, baseDelayMs: number) => Math.min(baseDelayMs * 2 ** (attempt - 1), 6 * 60_000);