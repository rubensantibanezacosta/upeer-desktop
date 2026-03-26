import type { ChildProcess } from 'node:child_process';
import type { AddressCallback, StatusCallback, YggStatus } from './yggstackShared.js';

export const yggstackState = {
    process: null as ChildProcess | null,
    detectedAddress: null as string | null,
    currentConfPath: null as string | null,
    isQuitting: false,
    restartAttempts: 0,
    addressCallbacks: [] as AddressCallback[],
    statusCallbacks: [] as StatusCallback[],
};

export function emitStatus(status: YggStatus, address?: string): void {
    yggstackState.statusCallbacks.forEach(cb => cb(status, address));
}

export function addAddressCallback(cb: AddressCallback): void {
    yggstackState.addressCallbacks.push(cb);
    if (yggstackState.detectedAddress) {
        cb(yggstackState.detectedAddress);
    }
}

export function addStatusCallback(cb: StatusCallback): void {
    yggstackState.statusCallbacks.push(cb);
}