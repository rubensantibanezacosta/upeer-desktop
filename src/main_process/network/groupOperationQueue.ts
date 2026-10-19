import { AsyncLocalStorage } from "node:async_hooks";

const groupQueues = new Map<string, Promise<void>>();
const activeGroupLocks = new AsyncLocalStorage<Set<string>>();
const groupQueueMarker = Symbol("groupQueueMarker");

export function withFreshGroupOperationLock<T>(
  groupId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const activeLocks = activeGroupLocks.getStore();
  return withGroupOperationLock(groupId, operation, activeLocks?.has(groupId) ?? false);
}

export function isGroupOperationLocked(groupId: string): boolean {
  return activeGroupLocks.getStore()?.has(groupId) ?? false;
}

export async function withGroupOperationLock<T>(
  groupId: string,
  operation: () => Promise<T>,
  forceQueue = false,
): Promise<T> {
  const activeLocks = activeGroupLocks.getStore();
  if (!forceQueue && activeLocks?.has(groupId)) return operation();

  const previous = groupQueues.get(groupId) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current) as Promise<void> & {
    [groupQueueMarker]?: true;
  };
  queued[groupQueueMarker] = true;
  groupQueues.set(groupId, queued);

  try {
    return await previous.then(() =>
      activeGroupLocks.run(new Set(forceQueue ? [] : activeLocks).add(groupId), operation),
    );
  } finally {
    release();
    if (groupQueues.get(groupId) === queued) groupQueues.delete(groupId);
  }
}

export function isGroupOperationPending(groupId: string): boolean {
  const queue = groupQueues.get(groupId) as (Promise<void> & {
    [groupQueueMarker]?: true;
  }) | undefined;
  return queue?.[groupQueueMarker] === true;
}
