const address = process.env.PEER_ID || '200::';
const addressListeners = [];

export function getYggstackAddress() {
    return address;
}

export function getRestartAttempts() {
    return 0;
}

export function getMaxRestartAttempts() {
    return 3;
}

export async function forceRestart() {
    return undefined;
}

export async function spawnYggstack() {
    return undefined;
}

export async function stopYggstack() {
    return undefined;
}

export function onYggstackStatus() {
    return undefined;
}

export function onYggstackAddress(cb) {
    addressListeners.push(cb);
    queueMicrotask(() => {
        for (const listener of addressListeners) {
            listener(address);
        }
    });
    return undefined;
}
