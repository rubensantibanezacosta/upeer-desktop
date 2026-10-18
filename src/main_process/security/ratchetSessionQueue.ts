import { AsyncLocalStorage } from 'node:async_hooks';

const sessionQueues = new Map<string, Promise<void>>();
const activeSessionLocks = new AsyncLocalStorage<Set<string>>();

export function ratchetSessionQueueKey(upeerId: string, contextId = 'direct'): string {
    return `${upeerId}:${contextId}`;
}

export function withRatchetSessionLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const activeLocks = activeSessionLocks.getStore();
    if (activeLocks?.has(key)) return operation();

    const previous = sessionQueues.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
        release = resolve;
    });
    const queued = previous.then(() => current);
    const tail = queued.then(() => undefined);
    sessionQueues.set(key, tail);

    return previous.then(() => activeSessionLocks.run(new Set(activeLocks).add(key), operation)).finally(() => {
        release();
        if (sessionQueues.get(key) === tail) sessionQueues.delete(key);
    });
}
